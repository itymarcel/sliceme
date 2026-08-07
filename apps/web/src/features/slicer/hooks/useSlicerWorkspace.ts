import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadDefaultConfig, requestSlice } from '../lib/slicerApi';
import { createClientId } from '../lib/createClientId';
import type {
  BuildVolume,
  ConfigBundle,
  ConfigSection,
  GcodeResult,
  Position,
  RangeOverride,
  Rotation,
  SelectedNode,
  SlicerModel,
  SliceStatus,
} from '../types';

const emptyConfig = (): ConfigBundle => ({ machine_config: {}, process_config: {}, filament_config: {} });
const emptyRange = (): RangeOverride => ({
  range: { min_z: 0, max_z: 10 },
  machine_config: {},
  process_config: {},
  filament_config: {},
});

const spiralModeSettings = {
  spiral_mode: '1',
  wall_loops: '1',
  sparse_infill_density: '0%',
  top_shell_layers: '0',
  top_shell_thickness: '0',
  enable_support: '0',
  support_on_build_plate_only: '0',
  enforce_support_layers: '0',
};

const isEnabled = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true';

function withSettingRelations(section: ConfigSection, settings: Record<string, unknown>, key: string, value: unknown) {
  const next = { ...settings, [key]: value };
  if (section === 'process_config' && key === 'spiral_mode' && isEnabled(value)) {
    Object.assign(next, spiralModeSettings);
  }
  return next;
}

function withSpiralFileRelations(current: Record<string, Partial<ConfigBundle>>) {
  return Object.fromEntries(Object.entries(current).map(([fileId, bundle]) => [fileId, {
    ...bundle,
    process_config: { ...(bundle.process_config ?? {}), ...spiralModeSettings },
  }]));
}

function withSpiralRangeRelations(current: Record<string, RangeOverride[]>) {
  return Object.fromEntries(Object.entries(current).map(([fileId, ranges]) => [fileId,
    ranges.map((range) => ({ ...range, process_config: { ...range.process_config, ...spiralModeSettings } })),
  ]));
}

function temperatureEvents(config: ConfigBundle, ranges: Record<string, RangeOverride[]>) {
  const numberValue = (value: unknown) => {
    const parsed = Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const sceneNozzle = numberValue(config.filament_config.nozzle_temperature);
  const sceneBed = numberValue(config.filament_config.hot_plate_temp);
  const events: Array<Record<string, unknown>> = [];
  const commands = (nozzle: number | null, bed: number | null) =>
    [nozzle === null ? '' : `M104 S${nozzle}`, bed === null ? '' : `M140 S${bed}`].filter(Boolean).join('\n');

  Object.values(ranges).flat().forEach((range) => {
    const nozzle = numberValue(range.filament_config.nozzle_temperature);
    const bed = numberValue(range.filament_config.hot_plate_temp);
    const start = commands(nozzle, bed);
    const end = commands(nozzle === null ? null : sceneNozzle, bed === null ? null : sceneBed);
    if (start) events.push({ top_z: range.range.min_z, type: 4, extruder: '1', color: '', extra: start, gcode: start });
    if (end) events.push({ top_z: range.range.max_z, type: 4, extruder: '1', color: '', extra: end, gcode: end });
  });
  return events.sort((a, b) => Number(a.top_z) - Number(b.top_z));
}

export function useSlicerWorkspace() {
  const [models, setModels] = useState<SlicerModel[]>([]);
  const [config, setConfig] = useState<ConfigBundle>(emptyConfig);
  const [fileOverrides, setFileOverrides] = useState<Record<string, Partial<ConfigBundle>>>({});
  const [rangeOverrides, setRangeOverrides] = useState<Record<string, RangeOverride[]>>({});
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [rotations, setRotations] = useState<Record<string, Rotation>>({});
  const [startPositions] = useState<Record<string, Position>>({});
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: 'scene' });
  const [gcode, setGcode] = useState<GcodeResult | null>(null);
  const [status, setStatus] = useState<SliceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const sliceController = useRef<AbortController | null>(null);
  const modelUrls = useRef(new Set<string>());
  const gcodeUrl = useRef<string | null>(null);

  const buildVolume: BuildVolume = useMemo(() => {
    const machine = config.machine_config;
    const area = Array.isArray(machine.printable_area) ? machine.printable_area.map(String) : [];
    const points = area.map((point) => point.split('x').map(Number)).filter((point) => point.length === 2);
    const xs = points.map((point) => point[0]).filter(Number.isFinite);
    const ys = points.map((point) => point[1]).filter(Number.isFinite);
    return {
      x: xs.length ? Math.max(...xs) - Math.min(...xs) : 250,
      y: ys.length ? Math.max(...ys) - Math.min(...ys) : 210,
      z: Number(machine.printable_height) || 100,
    };
  }, [config.machine_config]);

  useEffect(() => {
    const controller = new AbortController();
    loadDefaultConfig(controller.signal)
      .then(setConfig)
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => setDefaultsLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    modelUrls.current.forEach(URL.revokeObjectURL);
    if (gcodeUrl.current) URL.revokeObjectURL(gcodeUrl.current);
    sliceController.current?.abort();
  }, []);

  const replaceGcode = useCallback((next: GcodeResult | null) => {
    if (gcodeUrl.current) URL.revokeObjectURL(gcodeUrl.current);
    gcodeUrl.current = next?.url ?? null;
    setGcode(next);
  }, []);

  const addModels = useCallback((files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /\.(stl|step|stp)$/i.test(file.name));
    setModels((current) => {
      const next = [...current];
      accepted.forEach((file, offset) => {
        const fileId = createClientId();
        const url = URL.createObjectURL(file);
        modelUrls.current.add(url);
        next.push({ fileId, fileName: file.name, fileSize: file.size, objectUrl: url, file });
        const index = current.length + offset;
        setPositions((value) => ({ ...value, [fileId]: { x: buildVolume.x / 2 + index * 20, y: buildVolume.y / 2 } }));
        setRotations((value) => ({ ...value, [fileId]: { x: 0, y: 0, z: 0 } }));
        setRangeOverrides((value) => ({ ...value, [fileId]: [] }));
        setSelectedNode({ type: 'file', fileId });
      });
      return next;
    });
    setError(null);
    setStatus('idle');
  }, [buildVolume]);

  const removeModel = useCallback((fileId: string) => {
    setModels((current) => {
      const removed = current.find((model) => model.fileId === fileId);
      if (removed) {
        URL.revokeObjectURL(removed.objectUrl);
        modelUrls.current.delete(removed.objectUrl);
      }
      return current.filter((model) => model.fileId !== fileId);
    });
    setFileOverrides((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setRangeOverrides((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setPositions((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setRotations((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setSelectedNode({ type: 'scene' });
  }, []);

  const setSetting = useCallback((section: ConfigSection, key: string, value: unknown) => {
    // OrcaSlicer defines whole-print spiral mode at process scope. Keep the
    // control useful while an object is selected, but store it globally and
    // make every existing object/range compatible with vase mode.
    if (section === 'process_config' && key === 'spiral_mode' && selectedNode.type === 'file') {
      setConfig((current) => ({
        ...current,
        process_config: withSettingRelations(section, current.process_config, key, value),
      }));
      if (isEnabled(value)) {
        setFileOverrides(withSpiralFileRelations);
        setRangeOverrides(withSpiralRangeRelations);
      }
      return;
    }
    if (selectedNode.type === 'scene') {
      setConfig((current) => ({ ...current, [section]: withSettingRelations(section, current[section], key, value) }));
      if (section === 'process_config' && key === 'spiral_mode' && isEnabled(value)) {
        setFileOverrides(withSpiralFileRelations);
        setRangeOverrides(withSpiralRangeRelations);
      }
    } else if (selectedNode.type === 'file') {
      setFileOverrides((current) => ({
        ...current,
        [selectedNode.fileId]: {
          ...current[selectedNode.fileId],
          [section]: withSettingRelations(section, current[selectedNode.fileId]?.[section] ?? {}, key, value),
        },
      }));
    } else {
      setRangeOverrides((current) => {
        const ranges = [...(current[selectedNode.fileId] ?? [])];
        const range = ranges[selectedNode.rangeIndex];
        ranges[selectedNode.rangeIndex] = { ...range, [section]: withSettingRelations(section, range[section], key, value) };
        return { ...current, [selectedNode.fileId]: ranges };
      });
    }
  }, [selectedNode]);

  const clearSetting = useCallback((section: ConfigSection, key: string) => {
    if (selectedNode.type === 'scene') return;
    if (selectedNode.type === 'file') {
      setFileOverrides((current) => {
        const next = structuredClone(current);
        delete next[selectedNode.fileId]?.[section]?.[key];
        return next;
      });
    } else {
      setRangeOverrides((current) => {
        const next = structuredClone(current);
        delete next[selectedNode.fileId]?.[selectedNode.rangeIndex]?.[section]?.[key];
        return next;
      });
    }
  }, [selectedNode]);

  const addRange = useCallback((fileId: string) => {
    setRangeOverrides((current) => {
      const rangeIndex = (current[fileId] ?? []).length;
      setSelectedNode({ type: 'range', fileId, rangeIndex });
      return { ...current, [fileId]: [...(current[fileId] ?? []), emptyRange()] };
    });
  }, []);

  const removeRange = useCallback((fileId: string, rangeIndex: number) => {
    setRangeOverrides((current) => ({
      ...current,
      [fileId]: (current[fileId] ?? []).filter((_, index) => index !== rangeIndex),
    }));
    setSelectedNode({ type: 'file', fileId });
  }, []);

  const setRangeBoundary = useCallback((fileId: string, rangeIndex: number, key: 'min_z' | 'max_z', value: number) => {
    setRangeOverrides((current) => {
      const ranges = [...(current[fileId] ?? [])];
      ranges[rangeIndex] = { ...ranges[rangeIndex], range: { ...ranges[rangeIndex].range, [key]: value } };
      return { ...current, [fileId]: ranges };
    });
  }, []);

  const slice = useCallback(async () => {
    if (!models.length) return;
    sliceController.current?.abort();
    const controller = new AbortController();
    sliceController.current = controller;
    setStatus('slicing');
    setError(null);
    try {
      const result = await requestSlice({
        models: models.map((model) => ({ id: model.fileId, name: model.fileName })),
        config,
        fileOverrides,
        rangeOverrides,
        transforms: Object.fromEntries(models.map((model) => [model.fileId, {
          position: positions[model.fileId] ?? { x: buildVolume.x / 2, y: buildVolume.y / 2 },
          rotation: rotations[model.fileId] ?? { x: 0, y: 0, z: 0 },
        }])),
        customGcodeForZ: temperatureEvents(config, rangeOverrides),
        startPositions,
      }, models, controller.signal);
      replaceGcode(result);
      setStatus('done');
    } catch (sliceError) {
      if ((sliceError as Error).name === 'AbortError') setStatus('idle');
      else { setStatus('error'); setError((sliceError as Error).message); }
    }
  }, [buildVolume, config, fileOverrides, models, positions, rangeOverrides, replaceGcode, rotations, startPositions]);

  const cancelSlice = useCallback(() => sliceController.current?.abort(), []);
  const dismissError = useCallback(() => setError(null), []);
  const clear = useCallback(() => {
    sliceController.current?.abort();
    modelUrls.current.forEach(URL.revokeObjectURL);
    modelUrls.current.clear();
    setModels([]); setFileOverrides({}); setRangeOverrides({}); setPositions({}); setRotations({});
    setSelectedNode({ type: 'scene' }); setError(null); setStatus('idle'); replaceGcode(null);
  }, [replaceGcode]);

  return {
    models, config, fileOverrides, rangeOverrides, positions, rotations, selectedNode, gcode,
    status, error, defaultsLoading, buildVolume, startPositions,
    setSelectedNode, addModels, removeModel, setSetting, clearSetting, addRange, removeRange,
    setRangeBoundary, setPositions, setRotations, slice, cancelSlice, dismissError, clear,
  };
}

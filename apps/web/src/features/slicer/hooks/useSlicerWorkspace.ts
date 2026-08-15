import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadDefaultConfig, requestEnhancement, requestProjectExport, requestProjectImport, requestSettingsPrefill, requestSlice } from '../lib/slicerApi';
import { createClientId } from '../lib/createClientId';
import {
  clearPersistedWorkspace,
  loadPersistedWorkspace,
  persistGcode,
  persistModels,
  persistWorkspace,
  requestDurableStorage,
} from '../lib/workspacePersistence';
import { defaultWorkspaceUi } from '../lib/workspaceUi';
import { machineConfigForPreset, machineConfigWithBuildDimension, PRINTER_PRESET_CONFIG_KEY } from '../lib/printerPresets';
import { createWorkspaceHistory, recordWorkspaceChange as recordHistoryChange, redoWorkspaceChange, undoWorkspaceChange, type WorkspaceHistorySnapshot } from '../lib/workspaceHistory';
import type {
  BuildVolume,
  ConfigBundle,
  ConfigSection,
  GcodeResult,
  GcodeEnhancement,
  Position,
  RangeOverride,
  Rotation,
  SelectedNode,
  SlicerModel,
  SliceStatus,
  WorkspaceUiState,
  SliceManifest,
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
  const [startPositions, setStartPositions] = useState<Record<string, Position>>({});
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: 'scene' });
  const [ui, setUi] = useState<WorkspaceUiState>(defaultWorkspaceUi);
  const [gcode, setGcode] = useState<GcodeResult | null>(null);
  const [status, setStatus] = useState<SliceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [enhancing, setEnhancing] = useState<GcodeEnhancement | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [projectBusy, setProjectBusy] = useState<'importing' | 'exporting' | null>(null);
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [history, setHistory] = useState(createWorkspaceHistory);
  const sliceController = useRef<AbortController | null>(null);
  const prefillController = useRef<AbortController | null>(null);
  const modelUrls = useRef(new Set<string>());
  const modelRegistry = useRef(new Map<string, SlicerModel>());
  const gcodeUrl = useRef<string | null>(null);
  const defaultConfigRef = useRef<ConfigBundle | null>(null);
  const persistenceErrorShown = useRef(false);

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

  const workspaceSnapshot = useCallback((): WorkspaceHistorySnapshot => ({
    modelOrder: models.map((model) => model.fileId),
    config,
    fileOverrides,
    rangeOverrides,
    positions,
    rotations,
    startPositions,
    selectedNode,
  }), [config, fileOverrides, models, positions, rangeOverrides, rotations, selectedNode, startPositions]);
  const recordWorkspaceChange = useCallback(() => setHistory((current) => recordHistoryChange(current, workspaceSnapshot())), [workspaceSnapshot]);
  const applyWorkspaceSnapshot = useCallback((snapshot: WorkspaceHistorySnapshot) => {
    setConfig(snapshot.config);
    setFileOverrides(snapshot.fileOverrides);
    setRangeOverrides(snapshot.rangeOverrides);
    setSelectedNode(snapshot.selectedNode);
    // Older persisted history entries predate model and transform snapshots.
    if (snapshot.modelOrder) setModels(snapshot.modelOrder.map((fileId) => modelRegistry.current.get(fileId)).filter((model): model is SlicerModel => !!model));
    if (snapshot.positions) setPositions(snapshot.positions);
    if (snapshot.rotations) setRotations(snapshot.rotations);
    if (snapshot.startPositions) setStartPositions(snapshot.startPositions);
    setStatus('idle');
  }, []);
  const undo = useCallback(() => {
    setHistory((current) => {
      const result = undoWorkspaceChange(current, workspaceSnapshot());
      if (result.snapshot) applyWorkspaceSnapshot(result.snapshot);
      return result.history;
    });
  }, [applyWorkspaceSnapshot, workspaceSnapshot]);
  const redo = useCallback(() => {
    setHistory((current) => {
      const result = redoWorkspaceChange(current, workspaceSnapshot());
      if (result.snapshot) applyWorkspaceSnapshot(result.snapshot);
      return result.history;
    });
  }, [applyWorkspaceSnapshot, workspaceSnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    Promise.allSettled([loadDefaultConfig(controller.signal), loadPersistedWorkspace()]).then(([defaultsResult, persistedResult]) => {
      if (cancelled) return;
      const defaults = defaultsResult.status === 'fulfilled' ? defaultsResult.value : null;
      const persisted = persistedResult.status === 'fulfilled' ? persistedResult.value : null;
      defaultConfigRef.current = defaults;

      if (persisted?.snapshot) {
        const snapshot = persisted.snapshot;
        setConfig(snapshot.config);
        setFileOverrides(snapshot.fileOverrides);
        setRangeOverrides(snapshot.rangeOverrides);
        setHistory(snapshot.history ?? createWorkspaceHistory());
        setPositions(snapshot.positions);
        setRotations(snapshot.rotations);
        setStartPositions(snapshot.startPositions);
        setSelectedNode(snapshot.selectedNode);
        setUi({ ...defaultWorkspaceUi(), ...snapshot.ui, gcodePreview: { ...defaultWorkspaceUi().gcodePreview, ...snapshot.ui?.gcodePreview } });

        const restoredById = new Map<string, SlicerModel>();
        persisted.models.forEach((stored) => {
          const file = new File([stored.blob], stored.fileName, { type: stored.fileType, lastModified: stored.lastModified });
          const objectUrl = URL.createObjectURL(file);
          const model = { fileId: stored.fileId, fileName: stored.fileName, fileSize: stored.fileSize, objectUrl, file };
          modelUrls.current.add(objectUrl);
          modelRegistry.current.set(model.fileId, model);
          restoredById.set(model.fileId, model);
        });
        setModels(snapshot.modelOrder.map((fileId) => restoredById.get(fileId)).filter((model): model is SlicerModel => !!model));
        if (persisted.gcode) {
          const url = URL.createObjectURL(persisted.gcode.blob);
          gcodeUrl.current = url;
          setGcode({ ...persisted.gcode, url });
          setStatus('done');
        }
      } else if (defaults) {
        setConfig(defaults);
      }

      if (!persisted && persistedResult.status === 'rejected') {
        setError(`Browser storage could not be opened: ${persistedResult.reason instanceof Error ? persistedResult.reason.message : 'unknown error'}`);
      } else if (!defaults && defaultsResult.status === 'rejected' && !persisted?.snapshot) {
        const reason = defaultsResult.reason;
        if ((reason as Error).name !== 'AbortError') setError((reason as Error).message);
      }
      setPersistenceReady(true);
      setDefaultsLoading(false);
      void requestDurableStorage().catch(() => undefined);
    });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const reportPersistenceError = useCallback((storageError: unknown) => {
    if (persistenceErrorShown.current) return;
    persistenceErrorShown.current = true;
    const message = storageError instanceof Error ? storageError.message : 'unknown browser storage error';
    setError(`Changes could not be saved in this browser: ${message}`);
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    const timeout = window.setTimeout(() => {
      void persistWorkspace({
        version: 1,
        modelOrder: models.map((model) => model.fileId),
        config,
        fileOverrides,
        rangeOverrides,
        positions,
        rotations,
        startPositions,
        selectedNode,
        ui,
        history,
      }).catch(reportPersistenceError);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [config, fileOverrides, history, models, persistenceReady, positions, rangeOverrides, reportPersistenceError, rotations, selectedNode, startPositions, ui]);

  useEffect(() => {
    if (persistenceReady) void persistModels(Array.from(modelRegistry.current.values())).catch(reportPersistenceError);
  }, [models, persistenceReady, reportPersistenceError]);

  useEffect(() => {
    if (persistenceReady) void persistGcode(gcode ? { fileName: gcode.fileName, blob: gcode.blob, enhancements: gcode.enhancements } : null).catch(reportPersistenceError);
  }, [gcode, persistenceReady, reportPersistenceError]);

  useEffect(() => () => {
    modelUrls.current.forEach(URL.revokeObjectURL);
    if (gcodeUrl.current) URL.revokeObjectURL(gcodeUrl.current);
    sliceController.current?.abort();
    prefillController.current?.abort();
  }, []);

  const replaceGcode = useCallback((next: GcodeResult | null) => {
    if (gcodeUrl.current) URL.revokeObjectURL(gcodeUrl.current);
    gcodeUrl.current = next?.url ?? null;
    setGcode(next);
  }, []);

  const addModels = useCallback((files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /\.(stl|step|stp)$/i.test(file.name));
    if (!accepted.length) return;
    recordWorkspaceChange();
    setModels((current) => {
      const next = [...current];
      accepted.forEach((file, offset) => {
        const fileId = createClientId();
        const url = URL.createObjectURL(file);
        const model = { fileId, fileName: file.name, fileSize: file.size, objectUrl: url, file };
        modelUrls.current.add(url);
        modelRegistry.current.set(fileId, model);
        next.push(model);
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
  }, [buildVolume, recordWorkspaceChange]);

  const sliceManifest = useCallback((): SliceManifest => ({
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
  }), [buildVolume, config, fileOverrides, models, positions, rangeOverrides, rotations, startPositions]);

  const importProject = useCallback(async (project: File) => {
    setProjectBusy('importing');
    setError(null);
    setProjectNotice(null);
    try {
      const imported = await requestProjectImport(project);
      const nextPositions: Record<string, Position> = {};
      const nextRotations: Record<string, Rotation> = {};
      const nextRanges: Record<string, RangeOverride[]> = {};
      const nextModels: SlicerModel[] = [];
      try {
        imported.models.forEach(({ file, position }) => {
          const fileId = createClientId();
          const objectUrl = URL.createObjectURL(file);
          nextPositions[fileId] = position;
          nextRotations[fileId] = { x: 0, y: 0, z: 0 };
          nextRanges[fileId] = [];
          nextModels.push({ fileId, fileName: file.name, fileSize: file.size, objectUrl, file });
        });
      } catch (urlError) {
        nextModels.forEach((model) => URL.revokeObjectURL(model.objectUrl));
        throw urlError;
      }
      modelUrls.current.forEach(URL.revokeObjectURL);
      modelUrls.current = new Set(nextModels.map((model) => model.objectUrl));
      modelRegistry.current = new Map(nextModels.map((model) => [model.fileId, model]));
      sliceController.current?.abort();
      setHistory(createWorkspaceHistory());
      setModels(nextModels);
      setConfig(imported.config);
      setFileOverrides({});
      setRangeOverrides(nextRanges);
      setPositions(nextPositions);
      setRotations(nextRotations);
      setStartPositions({});
      setSelectedNode({ type: 'scene' });
      replaceGcode(null);
      setStatus('idle');
      setProjectNotice(imported.warnings.length
        ? `Imported ${nextModels.length} model${nextModels.length === 1 ? '' : 's'}. ${imported.warnings.join(' ')}`
        : `Imported ${nextModels.length} model${nextModels.length === 1 ? '' : 's'} and supported Orca settings.`);
    } catch (projectError) {
      setError((projectError as Error).message);
    } finally {
      setProjectBusy(null);
    }
  }, [replaceGcode]);

  const exportProject = useCallback(async () => {
    if (!models.length) return;
    setProjectBusy('exporting');
    setError(null);
    try {
      const result = await requestProjectExport(sliceManifest(), models);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 0);
    } catch (projectError) {
      setError((projectError as Error).message);
    } finally {
      setProjectBusy(null);
    }
  }, [models, sliceManifest]);

  const removeModel = useCallback((fileId: string) => {
    if (!models.some((model) => model.fileId === fileId)) return;
    recordWorkspaceChange();
    setModels((current) => current.filter((model) => model.fileId !== fileId));
    setFileOverrides((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setRangeOverrides((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setPositions((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setRotations((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setStartPositions((current) => { const next = { ...current }; delete next[fileId]; return next; });
    setSelectedNode({ type: 'scene' });
  }, [models, recordWorkspaceChange]);

  const setSetting = useCallback((section: ConfigSection, key: string, value: unknown) => {
    recordWorkspaceChange();
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
      if (section === 'machine_config' && (key === 'printable_width' || key === 'printable_depth')) {
        const dimension = key === 'printable_width' ? 'width' : 'depth';
        setConfig((current) => ({
          ...current,
          machine_config: machineConfigWithBuildDimension(current.machine_config, dimension, Number(value)),
        }));
        return;
      }
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
  }, [recordWorkspaceChange, selectedNode]);

  const applyPrinterPreset = useCallback((presetId: string) => {
    const presetConfig = presetId === 'custom'
      ? { [PRINTER_PRESET_CONFIG_KEY]: '' }
      : machineConfigForPreset(presetId);
    recordWorkspaceChange();
    setConfig((current) => ({
      ...current,
      machine_config: { ...current.machine_config, ...presetConfig },
    }));
  }, [recordWorkspaceChange]);


  const addRange = useCallback((fileId: string) => {
    recordWorkspaceChange();
    setRangeOverrides((current) => {
      const rangeIndex = (current[fileId] ?? []).length;
      setSelectedNode({ type: 'range', fileId, rangeIndex });
      return { ...current, [fileId]: [...(current[fileId] ?? []), emptyRange()] };
    });
  }, [recordWorkspaceChange]);

  const removeRange = useCallback((fileId: string, rangeIndex: number) => {
    recordWorkspaceChange();
    setRangeOverrides((current) => ({
      ...current,
      [fileId]: (current[fileId] ?? []).filter((_, index) => index !== rangeIndex),
    }));
    setSelectedNode({ type: 'file', fileId });
  }, [recordWorkspaceChange]);

  const setRangeBoundary = useCallback((fileId: string, rangeIndex: number, key: 'min_z' | 'max_z', value: number) => {
    recordWorkspaceChange();
    setRangeOverrides((current) => {
      const ranges = [...(current[fileId] ?? [])];
      ranges[rangeIndex] = { ...ranges[rangeIndex], range: { ...ranges[rangeIndex].range, [key]: value } };
      return { ...current, [fileId]: ranges };
    });
  }, [recordWorkspaceChange]);

  const setPositionsWithHistory = useCallback((next: Record<string, Position> | ((current: Record<string, Position>) => Record<string, Position>), record = true) => {
    if (record) recordWorkspaceChange();
    setPositions(next);
  }, [recordWorkspaceChange]);

  const setRotationsWithHistory = useCallback((next: Record<string, Rotation> | ((current: Record<string, Rotation>) => Record<string, Rotation>), record = true) => {
    if (record) recordWorkspaceChange();
    setRotations(next);
  }, [recordWorkspaceChange]);

  const beginTransformChange = recordWorkspaceChange;

  const slice = useCallback(async () => {
    if (!models.length) return;
    sliceController.current?.abort();
    const controller = new AbortController();
    sliceController.current = controller;
    setStatus('slicing');
    setError(null);
    try {
      const result = await requestSlice(sliceManifest(), models, controller.signal);
      replaceGcode(result);
      setUi((current) => ({ ...current, gcodePreview: defaultWorkspaceUi().gcodePreview }));
      setStatus('done');
    } catch (sliceError) {
      if ((sliceError as Error).name === 'AbortError') setStatus('idle');
      else { setStatus('error'); setError((sliceError as Error).message); }
    }
  }, [models, replaceGcode, sliceManifest]);

  const cancelSlice = useCallback(() => sliceController.current?.abort(), []);
  const enhanceGcode = useCallback(async (operation: GcodeEnhancement) => {
    if (!gcode || enhancing) return;
    const controller = new AbortController();
    sliceController.current = controller;
    setEnhancing(operation);
    setError(null);
    try {
      replaceGcode(await requestEnhancement(gcode, operation, controller.signal));
    } catch (enhanceError) {
      if ((enhanceError as Error).name !== 'AbortError') setError((enhanceError as Error).message);
    } finally {
      setEnhancing(null);
    }
  }, [enhancing, gcode, replaceGcode]);
  const prefillSettings = useCallback(async () => {
    const description = ui.prefillDescription.trim();
    if (!description || prefilling) return;
    prefillController.current?.abort();
    const controller = new AbortController();
    prefillController.current = controller;
    setPrefilling(true);
    setError(null);
    try {
      const recommendation = await requestSettingsPrefill(description, config, controller.signal);
      recordWorkspaceChange();
      const processConfig = { ...recommendation.process_config };
      if (isEnabled(processConfig.spiral_mode)) Object.assign(processConfig, spiralModeSettings);
      const filamentConfig = Object.fromEntries(Object.entries(recommendation.filament_config).filter(
        ([key]) => key !== 'filament_type' && key !== 'filament_diameter',
      ));
      const machineConfig = recommendation.machine_config.nozzle_diameter === undefined
        ? {}
        : { nozzle_diameter: recommendation.machine_config.nozzle_diameter };
      setConfig((current) => ({
        machine_config: { ...current.machine_config, ...machineConfig },
        process_config: { ...current.process_config, ...processConfig },
        filament_config: { ...current.filament_config, ...filamentConfig },
      }));
      setSelectedNode({ type: 'scene' });
      setUi((current) => ({
        ...current,
        aiHighlightedFields: {
          machine_config: Object.keys(machineConfig),
          process_config: Object.keys(processConfig),
          filament_config: Object.keys(filamentConfig),
        },
      }));
    } catch (prefillError) {
      if ((prefillError as Error).name !== 'AbortError') setError((prefillError as Error).message);
    } finally {
      setPrefilling(false);
    }
  }, [config, prefilling, recordWorkspaceChange, ui.prefillDescription]);
  const clearAiFieldHighlight = useCallback((section: ConfigSection, key: string) => {
    setUi((current) => ({
      ...current,
      aiHighlightedFields: {
        ...current.aiHighlightedFields,
        [section]: (current.aiHighlightedFields[section] ?? []).filter((field) => field !== key),
      },
    }));
  }, []);
  const dismissError = useCallback(() => setError(null), []);
  const clear = useCallback(() => {
    sliceController.current?.abort();
    prefillController.current?.abort();
    modelUrls.current.forEach(URL.revokeObjectURL);
    modelUrls.current.clear();
    modelRegistry.current.clear();
    setHistory(createWorkspaceHistory());
    setModels([]); setFileOverrides({}); setRangeOverrides({}); setPositions({}); setRotations({}); setStartPositions({});
    setConfig(defaultConfigRef.current ?? emptyConfig()); setSelectedNode({ type: 'scene' }); setUi(defaultWorkspaceUi());
    setError(null); setStatus('idle'); replaceGcode(null);
    void clearPersistedWorkspace().catch(reportPersistenceError);
  }, [replaceGcode, reportPersistenceError]);

  return {
    models, config, fileOverrides, rangeOverrides, positions, rotations, selectedNode, gcode,
    status, error, defaultsLoading, buildVolume, startPositions, enhancing, prefilling, projectBusy, projectNotice, ui, setUi,
    setSelectedNode, addModels, removeModel, setSetting, applyPrinterPreset, addRange, removeRange,
    setRangeBoundary, setPositions: setPositionsWithHistory, setRotations: setRotationsWithHistory, beginTransformChange, slice, cancelSlice, enhanceGcode, prefillSettings,
    clearAiFieldHighlight, dismissError, dismissProjectNotice: () => setProjectNotice(null), importProject, exportProject, clear,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
  };
}

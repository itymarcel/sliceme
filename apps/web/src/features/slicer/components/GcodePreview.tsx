import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Color, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { Axis3d, BroomSparkles, Check, Code2, Cuboid, Layers3, LoaderCircle, X } from 'lucide-react';

import { CameraPresetControls } from './CameraPresetControls';
import { GcodeSourceEditor, type GcodeSourceEditorHandle } from './GcodeSourceEditor';
import { ToolpathControls } from './ToolpathControls';
import { init, type WebGLPreview } from '../lib/gcode-preview/gcode-preview';
import type { GCodeCommand, Layer } from '../lib/gcode-preview/gcode-parser';
import type { BuildVolume, GcodeEnhancement, GcodePreviewUiState, GcodeResult } from '../types';
import { isToolpathVisible, toolpathColor, toolpathTypesFromLayers } from '../lib/toolpathVisibility';

type CameraPreset = 'top' | 'front' | 'right' | 'fit';
type PrinterPosition = { x: number; y: number; z: number };
type IndexedMove = {
  lineNumber: number;
  layerIndex: number;
  moveNumber: number;
  extruding: boolean;
  toolpathType?: string;
  printer: PrinterPosition;
  scene: Vector3;
};
type ProjectedMove = { lineNumber: number; x: number; y: number; depth: number };
type MoveIndex = { byLine: Map<number, IndexedMove>; lineNumbers: number[] };
const TRAVEL_TOOLPATH = 'Travel moves';
const PICK_CELL_SIZE = 24;
const PICK_RADIUS = 14;

const enhancementOptions: Array<{ id: GcodeEnhancement; label: string; description: string }> = [
  { id: 'perimeter_echo', label: 'Perimeter echo', description: 'Blend the end of the first outer perimeter into its beginning.' },
  { id: 'smooth_vase_transition', label: 'Smooth vase transition', description: 'Ease extrusion where standard layers change into spiral motion.' },
  { id: 'coast_final_layer', label: 'Coast final layer', description: 'Gradually reduce extrusion across the final printed layer.' },
  { id: 'slow_motion_80', label: 'Slow detailed moves', description: 'Reduce printing feedrates below 3000 mm/min to 80%.' },
];

const moveCodes = new Set(['g0', 'g00', 'g1', 'g01', 'g2', 'g02', 'g3', 'g03']);
const commandParams = (command: GCodeCommand) => (command.params ?? {}) as Record<string, number | undefined>;
const isPositionMove = (command: GCodeCommand) => {
  const params = commandParams(command);
  return moveCodes.has(command.gcode) && (params.x !== undefined || params.y !== undefined || params.z !== undefined);
};
const layerMoveCount = (layer?: Layer) => layer?.commands.filter(isPositionMove).length ?? 0;

export const nearestIndexedLine = (lineNumbers: number[], requested: number) => {
  if (!lineNumbers.length) return null;
  let low = 0;
  let high = lineNumbers.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = lineNumbers[middle];
    if (current === requested) return current;
    if (current < requested) low = middle + 1;
    else high = middle - 1;
  }
  const previous = high >= 0 ? lineNumbers[high] : null;
  const next = low < lineNumbers.length ? lineNumbers[low] : null;
  if (previous === null) return next;
  if (next === null) return previous;
  return requested - previous <= next - requested ? previous : next;
};

export const buildMoveIndex = (preview: Pick<WebGLPreview, 'parser'>, buildVolume: BuildVolume): MoveIndex => {
  const byLine = new Map<number, IndexedMove>();
  const state = { x: 0, y: 0, z: 0, e: 0 };
  let relativePosition = false;
  let relativeExtrusion = false;
  const layers = [preview.parser.preamble, ...preview.parser.layers];

  layers.forEach((layer, parserLayerIndex) => {
    const layerIndex = parserLayerIndex - 1;
    let moveNumber = 0;
    layer.commands.forEach((command, commandIndex) => {
      const params = commandParams(command);
      if (command.gcode === 'g90') relativePosition = false;
      if (command.gcode === 'g91') relativePosition = true;
      if (command.gcode === 'm82') relativeExtrusion = false;
      if (command.gcode === 'm83') relativeExtrusion = true;
      if (command.gcode === 'g92') {
        if (params.x !== undefined) state.x = params.x;
        if (params.y !== undefined) state.y = params.y;
        if (params.z !== undefined) state.z = params.z;
        if (params.e !== undefined) state.e = params.e;
      }
      if (!isPositionMove(command)) return;

      const next = {
        x: params.x === undefined ? state.x : relativePosition ? state.x + params.x : params.x,
        y: params.y === undefined ? state.y : relativePosition ? state.y + params.y : params.y,
        z: params.z === undefined ? state.z : relativePosition ? state.z + params.z : params.z,
        e: params.e === undefined ? state.e : relativeExtrusion ? state.e + params.e : params.e,
      };
      const moved = next.x !== state.x || next.y !== state.y || next.z !== state.z;
      const extruding = params.e !== undefined && (relativeExtrusion ? params.e > 0 : next.e > state.e);
      moveNumber += 1;
      if (moved) {
        const lineNumber = (layer === preview.parser.preamble ? 0 : layer.lineNumber) + commandIndex + 1;
        byLine.set(lineNumber, {
          lineNumber,
          layerIndex,
          moveNumber,
          extruding,
          toolpathType: command.toolpathType,
          printer: { x: next.x, y: next.y, z: next.z },
          scene: new Vector3(next.x - buildVolume.x / 2, next.z, buildVolume.y / 2 - next.y),
        });
      }
      Object.assign(state, next);
    });
  });

  return { byLine, lineNumbers: [...byLine.keys()].sort((a, b) => a - b) };
};

const commandsThroughMove = (layer: Layer, visibleMoves: number) => {
  if (visibleMoves >= layerMoveCount(layer)) return layer.commands;
  if (visibleMoves <= 0) return [];
  let moves = 0;
  const commandIndex = layer.commands.findIndex((command) => isPositionMove(command) && ++moves === visibleMoves);
  return layer.commands.slice(0, commandIndex + 1);
};

const toolheadAt = (preview: WebGLPreview, layerIndex: number, visibleMoves: number): PrinterPosition | null => {
  const state: PrinterPosition = { x: 0, y: 0, z: 0 };
  let relative = false;
  let moved = false;
  const layers = [preview.parser.preamble, ...preview.parser.layers.slice(0, layerIndex)];
  const current = preview.parser.layers[layerIndex];
  if (current) layers.push({ ...current, commands: commandsThroughMove(current, visibleMoves) });

  layers.flatMap((layer) => layer.commands).forEach((command) => {
    const params = commandParams(command);
    if (command.gcode === 'g90') relative = false;
    if (command.gcode === 'g91') relative = true;
    if (command.gcode === 'g92') {
      if (params.x !== undefined) state.x = params.x;
      if (params.y !== undefined) state.y = params.y;
      if (params.z !== undefined) state.z = params.z;
    }
    if (!isPositionMove(command)) return;
    if (params.x !== undefined) state.x = relative ? state.x + params.x : params.x;
    if (params.y !== undefined) state.y = relative ? state.y + params.y : params.y;
    if (params.z !== undefined) state.z = relative ? state.z + params.z : params.z;
    moved = true;
  });
  return moved ? state : null;
};

const fitDistance = (preview: WebGLPreview) => {
  const content = preview.scene.getObjectByName('allLayers');
  const box = new Box3();
  const travelColor = new Color('#fb7185').getHex();
  content?.traverse((object) => {
    const material = (object as { material?: { color?: Color } }).material;
    if (!material?.color || material.color.getHex() === travelColor) return;
    const objectBox = new Box3().setFromObject(object);
    if (!objectBox.isEmpty()) box.union(objectBox);
  });
  if (box.isEmpty() && content) box.setFromObject(content);
  const center = new Vector3();
  const size = new Vector3();

  if (box.isEmpty()) {
    center.set(0, 0, 0);
    size.set(200, 100, 200);
  } else {
    box.getCenter(center);
    box.getSize(size);
  }

  const maxDimension = Math.max(size.x, size.y, size.z, 20);
  const fov = MathUtils.degToRad(preview.camera.fov);
  return { center, distance: (maxDimension / (2 * Math.tan(fov / 2))) * 3.5 };
};

const metadataValue = (source: string, expression: RegExp) => source.match(expression)?.[1]?.trim() ?? '—';
const formatBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${(bytes / 1024).toFixed(1)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function ToolbarToggle({ checked, icon, label, onChange }: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: () => void;
}) {
  return (
    <button className={`toolbar-button ${checked ? 'active' : ''}`} type="button" aria-pressed={checked} onClick={onChange}>
      {icon}<span>{label}</span>
    </button>
  );
}

export function GcodePreview({ result, buildVolume, enhancing, onEnhance, onSourceChange, ui, onUiChange, expanded, onToggleExpanded }: {
  result: GcodeResult;
  buildVolume: BuildVolume;
  enhancing: GcodeEnhancement | null;
  onEnhance: (operation: GcodeEnhancement) => void;
  onSourceChange: (source: string) => void;
  ui: GcodePreviewUiState;
  onUiChange: (ui: GcodePreviewUiState) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<WebGLPreview>();
  const toolheadRef = useRef<Group>();
  const editorRef = useRef<GcodeSourceEditorHandle>(null);
  const moveIndexRef = useRef<MoveIndex>({ byLine: new Map(), lineNumbers: [] });
  const projectedMovesRef = useRef<Map<string, ProjectedMove[]>>(new Map());
  const selectedLineRef = useRef<number | null>(null);
  const hoveredLineRef = useRef<number | null>(null);
  const selectedMarkerRef = useRef<Group>();
  const hoverMarkerRef = useRef<Group>();
  const uiRef = useRef(ui);
  const lastLocallySavedSourceRef = useRef<string | null>(null);
  const [source, setSource] = useState('');
  const [editorSource, setEditorSource] = useState('');
  const [updatingSource, setUpdatingSource] = useState(false);
  const [layerCount, setLayerCount] = useState(0);
  const [movesInLayer, setMovesInLayer] = useState(0);
  const [toolhead, setToolhead] = useState<PrinterPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [toolpathTypes, setToolpathTypes] = useState<string[]>([]);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const isMobile = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches;

  const { editMode, layerIndex, moveCount, showGrid, showPrintPreview, mutedToolpaths = [], soloedToolpaths = [], colorToolpaths = false } = ui;
  const updateUi = (patch: Partial<GcodePreviewUiState>) => onUiChange({ ...ui, ...patch });
  uiRef.current = ui;


  const stats = useMemo(() => ({
    time: metadataValue(source, /^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/im),
    filament: metadataValue(source, /^;\s*filament used \[mm\]\s*=\s*(.+)$/im),
    weight: metadataValue(source, /^;\s*total filament used \[g\]\s*=\s*(.+)$/im),
    cost: metadataValue(source, /^;\s*total filament cost\s*=\s*(.+)$/im),
    nozzle: metadataValue(source, /^;\s*nozzle_diameter\s*=\s*([^,\r\n]+)/im),
  }), [source]);

  const applyGridVisibility = useCallback((preview: WebGLPreview, visible: boolean) => {
    const grid = preview.scene.getObjectByName('build-volume-grid');
    const bounds = preview.scene.getObjectByName('build-volume-bounds');
    if (grid) grid.visible = visible;
    if (bounds) bounds.visible = visible;
    preview.requestRender();
  }, []);

  const setCameraPreset = useCallback((preset: CameraPreset) => {
    const preview = previewRef.current;
    if (!preview) return;
    const { center, distance } = fitDistance(preview);
    const camera = preview.camera;

    camera.up.set(0, 1, 0);
    if (preset === 'top') {
      camera.position.set(center.x, center.y + distance, center.z);
      camera.up.set(0, 0, -1);
    } else if (preset === 'front') {
      camera.position.set(center.x, center.y, center.z + distance);
    } else if (preset === 'right') {
      camera.position.set(center.x + distance, center.y, center.z);
    } else {
      camera.position.set(center.x + distance * 0.7, center.y + distance * 0.55, center.z + distance * 0.75);
    }

    camera.near = Math.max(0.1, distance / 1000);
    camera.far = Math.max(100000, distance * 20);
    camera.updateProjectionMatrix();
    preview.controls.target.copy(center);
    preview.controls.update();
    preview.requestRender();
  }, []);

  const disposeToolhead = useCallback(() => {
    const marker = toolheadRef.current;
    if (!marker) return;
    marker.removeFromParent();
    marker.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
      else mesh.material?.dispose();
    });
    toolheadRef.current = undefined;
  }, []);

  const addToolhead = useCallback((preview: WebGLPreview, position: PrinterPosition | null) => {
    disposeToolhead();
    setToolhead(position);
    if (!position) return;
    const marker = new Group();
    const coneHeight = 18;
    const cone = new Mesh(
      new ConeGeometry(5.5, coneHeight, 18),
      new MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.96, depthTest: false }),
    );
    cone.position.y = coneHeight / 2;
    cone.rotation.x = Math.PI;
    cone.renderOrder = 1002;
    marker.add(cone);
    marker.position.set(position.x - buildVolume.x / 2, position.z, buildVolume.y / 2 - position.y);
    marker.renderOrder = 1002;
    preview.scene.add(marker);
    toolheadRef.current = marker;
    preview.requestRender();
  }, [buildVolume.x, buildVolume.y, disposeToolhead]);

  const disposeEditMarkers = useCallback(() => {
    [selectedMarkerRef, hoverMarkerRef].forEach((markerRef) => {
      const marker = markerRef.current;
      if (!marker) return;
      marker.removeFromParent();
      marker.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose();
      });
      markerRef.current = undefined;
    });
  }, []);

  const moveIsVisible = useCallback((move: IndexedMove) => {
    const current = uiRef.current;
    if (move.layerIndex > current.layerIndex) return false;
    if (move.layerIndex === current.layerIndex && move.moveNumber > current.moveCount) return false;
    return move.extruding
      ? isToolpathVisible(move.toolpathType ?? '', current.mutedToolpaths, current.soloedToolpaths)
      : isToolpathVisible(TRAVEL_TOOLPATH, current.mutedToolpaths, current.soloedToolpaths);
  }, []);

  const refreshEditMarkers = useCallback((preview: WebGLPreview) => {
    disposeEditMarkers();
    if (!uiRef.current.editMode) return;

    const addMarker = (lineNumber: number | null, opacity: number, target: React.MutableRefObject<Group | undefined>) => {
      const move = lineNumber === null ? undefined : moveIndexRef.current.byLine.get(lineNumber);
      if (!move || !moveIsVisible(move)) return;
      const marker = new Group();
      const coneHeight = 16;
      const cone = new Mesh(
        new ConeGeometry(5, coneHeight, 16),
        new MeshBasicMaterial({ color: 0x89ff8e, transparent: true, opacity, depthTest: false }),
      );
      cone.position.y = coneHeight / 2;
      cone.rotation.x = Math.PI;
      cone.renderOrder = 1004;
      marker.add(cone);
      marker.position.copy(move.scene);
      marker.position.y += 1.2;
      marker.renderOrder = 1004;
      preview.scene.add(marker);
      target.current = marker;
    };

    addMarker(selectedLineRef.current, 0.9, selectedMarkerRef);
    if (hoveredLineRef.current !== selectedLineRef.current) addMarker(hoveredLineRef.current, 0.38, hoverMarkerRef);
    preview.requestRender();
  }, [disposeEditMarkers, moveIsVisible]);

  const rebuildProjectedMoves = useCallback((preview: WebGLPreview) => {
    if (!uiRef.current.editMode) {
      projectedMovesRef.current = new Map();
      return;
    }
    const grid = new Map<string, ProjectedMove[]>();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    moveIndexRef.current.byLine.forEach((move) => {
      if (!moveIsVisible(move)) return;
      const projected = move.scene.clone();
      projected.y += 1.2;
      projected.project(preview.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      const key = `${Math.floor(x / PICK_CELL_SIZE)}:${Math.floor(y / PICK_CELL_SIZE)}`;
      const candidate = { lineNumber: move.lineNumber, x, y, depth: projected.z };
      const bucket = grid.get(key);
      if (bucket) bucket.push(candidate);
      else grid.set(key, [candidate]);
    });
    projectedMovesRef.current = grid;
  }, [moveIsVisible]);

  const pickLine = useCallback((event: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cellX = Math.floor(x / PICK_CELL_SIZE);
    const cellY = Math.floor(y / PICK_CELL_SIZE);
    const candidates: ProjectedMove[] = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        candidates.push(...(projectedMovesRef.current.get(`${cellX + dx}:${cellY + dy}`) ?? []));
      }
    }
    return candidates
      .map((candidate) => ({ ...candidate, distance: (candidate.x - x) ** 2 + (candidate.y - y) ** 2 }))
      .filter((candidate) => candidate.distance <= PICK_RADIUS ** 2)
      .sort((a, b) => Math.abs(a.distance - b.distance) > 9 ? a.distance - b.distance : a.depth - b.depth)[0]?.lineNumber ?? null;
  }, []);

  const syncToLine = useCallback((requestedLine: number, origin: 'editor' | 'preview') => {
    const lineNumber = nearestIndexedLine(moveIndexRef.current.lineNumbers, requestedLine);
    const move = lineNumber === null ? undefined : moveIndexRef.current.byLine.get(lineNumber);
    if (lineNumber === null || !move) return;
    selectedLineRef.current = lineNumber;
    const nextLayer = Math.max(0, move.layerIndex);
    const nextMove = move.layerIndex < 0 ? 0 : move.moveNumber;
    onUiChange({ ...uiRef.current, layerIndex: nextLayer, moveCount: nextMove });
    if (origin === 'preview') editorRef.current?.setLine(lineNumber);
    const preview = previewRef.current;
    if (preview) refreshEditMarkers(preview);
  }, [onUiChange, refreshEditMarkers]);

  useEffect(() => {
    let cancelled = false;
    result.blob.text().then((text) => {
      if (!cancelled) {
        setSource(text);
        if (text !== lastLocallySavedSourceRef.current) setEditorSource(text);
      }
    });
    return () => { cancelled = true; };
  }, [result.blob]);

  useEffect(() => {
    if (!source || editorSource === source) {
      setUpdatingSource(false);
      return;
    }
    setUpdatingSource(true);
    const timeout = window.setTimeout(() => {
      lastLocallySavedSourceRef.current = editorSource;
      setSource(editorSource);
      onSourceChange(editorSource);
      setUpdatingSource(false);
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [editorSource, onSourceChange, source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    setLoading(true);

    const preview = init({
      canvas,
      buildVolume,
      backgroundColor: '#090d12',
      extrusionColor: ['#eeee45', '#60a5fa', '#c084fc'],
      topLayerColor: '#ecfccb',
      lastSegmentColor: '#ffffff',
      travelColor: '#fb7185',
      lineWidth: 1.5,
      renderExtrusion: true,
      renderTravel: isToolpathVisible(TRAVEL_TOOLPATH, mutedToolpaths, soloedToolpaths),
      renderTubes: showPrintPreview,
      extrusionWidth: 0.6,
      devMode: false,
    });

    previewRef.current = preview;
    preview.camera.far = 100000;
    preview.camera.updateProjectionMatrix();
    preview.processGCode(source);
    moveIndexRef.current = buildMoveIndex(preview, buildVolume);
    const count = preview.parser.layers.length;
    setToolpathTypes([TRAVEL_TOOLPATH, ...toolpathTypesFromLayers(preview.parser.layers).filter((type) => type !== TRAVEL_TOOLPATH)]);
    const lastLayer = Math.max(0, count - 1);
    const restoredLayer = ui.layerIndex < 0 ? lastLayer : Math.min(ui.layerIndex, lastLayer);
    const restoredLayerMoves = layerMoveCount(preview.parser.layers[restoredLayer]);
    const restoredMove = ui.moveCount < 0 ? restoredLayerMoves : Math.min(ui.moveCount, restoredLayerMoves);
    setLayerCount(count);
    setMovesInLayer(restoredLayerMoves);
    updateUi({ layerIndex: restoredLayer, moveCount: restoredMove });
    applyGridVisibility(preview, showGrid);
    setLoading(false);

    const resize = new ResizeObserver(() => {
      preview.resize();
      preview.requestRender();
    });
    resize.observe(canvas);
    const fitFrame = requestAnimationFrame(() => setCameraPreset('fit'));

    return () => {
      cancelAnimationFrame(fitFrame);
      resize.disconnect();
      disposeToolhead();
      disposeEditMarkers();
      projectedMovesRef.current = new Map();
      preview.dispose();
      if (previewRef.current === preview) previewRef.current = undefined;
    };
  }, [applyGridVisibility, buildVolume.x, buildVolume.y, buildVolume.z, disposeEditMarkers, disposeToolhead, source]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !layerCount) return;
    const layer = preview.parser.layers[layerIndex];
    if (!layer) return;
    const originalCommands = layer.commands;
    layer.commands = commandsThroughMove(layer, moveCount);
    preview.endLayer = layerIndex + 2; // renderer layer zero is the G-code preamble
    preview.renderTravel = isToolpathVisible(TRAVEL_TOOLPATH, mutedToolpaths, soloedToolpaths);
    preview.travelColor = new Color(colorToolpaths ? toolpathColor(TRAVEL_TOOLPATH) : '#fb7185');
    preview.renderTubes = showPrintPreview;
    preview.toolpathVisible = (type) => isToolpathVisible(type, mutedToolpaths, soloedToolpaths);
    preview.toolpathColor = (type) => colorToolpaths && type ? toolpathColor(type) : undefined;
    disposeEditMarkers();
    preview.render();
    layer.commands = originalCommands;
    applyGridVisibility(preview, showGrid);
    addToolhead(preview, toolheadAt(preview, layerIndex, moveCount));
    refreshEditMarkers(preview);
    rebuildProjectedMoves(preview);
  }, [addToolhead, applyGridVisibility, colorToolpaths, disposeEditMarkers, editMode, layerCount, layerIndex, moveCount, mutedToolpaths, rebuildProjectedMoves, refreshEditMarkers, showGrid, showPrintPreview, soloedToolpaths]);

  useEffect(() => {
    const preview = previewRef.current;
    const canvas = canvasRef.current;
    if (!editMode || !preview || !canvas) {
      projectedMovesRef.current = new Map();
      hoveredLineRef.current = null;
      if (preview) refreshEditMarkers(preview);
      return;
    }

    let projectionFrame = 0;
    let hoverFrame = 0;
    let pointerDown: { x: number; y: number } | null = null;
    const scheduleProjection = () => {
      if (projectionFrame) return;
      projectionFrame = window.requestAnimationFrame(() => {
        projectionFrame = 0;
        rebuildProjectedMoves(preview);
      });
    };
    const onMove = (event: MouseEvent) => {
      if (hoverFrame) window.cancelAnimationFrame(hoverFrame);
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = 0;
        hoveredLineRef.current = pickLine(event);
        refreshEditMarkers(preview);
      });
    };
    const onLeave = () => {
      hoveredLineRef.current = null;
      pointerDown = null;
      refreshEditMarkers(preview);
    };
    const onDown = (event: MouseEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const onUp = (event: MouseEvent) => {
      if (!pointerDown) return;
      const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (distance > 5) return;
      const line = pickLine(event);
      if (line !== null) syncToLine(line, 'preview');
    };

    rebuildProjectedMoves(preview);
    preview.controls.addEventListener('change', scheduleProjection);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    return () => {
      preview.controls.removeEventListener('change', scheduleProjection);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
      if (projectionFrame) window.cancelAnimationFrame(projectionFrame);
      if (hoverFrame) window.cancelAnimationFrame(hoverFrame);
    };
  }, [editMode, pickLine, rebuildProjectedMoves, refreshEditMarkers, source, syncToLine]);

  const selectLayer = (nextLayer: number) => {
    const preview = previewRef.current;
    const bounded = Math.max(0, Math.min(layerCount - 1, nextLayer));
    const count = layerMoveCount(preview?.parser.layers[bounded]);
    setMovesInLayer(count);
    updateUi({ layerIndex: bounded, moveCount: count });
  };

  const toggleStats = () => {
    if (isMobile) setStatsCollapsed((collapsed) => !collapsed);
  };


  return (
    <section className="gcode-preview">
      <div className="preview-toolbar">
        <button className={`gcode-edit-mode-toggle ${editMode ? 'active' : ''}`} type="button" aria-pressed={editMode} title="Link G-code lines with points in the preview" onClick={() => updateUi({ editMode: !editMode })}>
          <Code2 size={14} /> Edit G-code
        </button>
        <div className="gcode-toolbar-controls">
          <ToolbarToggle checked={showPrintPreview} icon={<Cuboid size={14} />} label="Print preview" onChange={() => updateUi({ showPrintPreview: !showPrintPreview })} />
          <ToolbarToggle checked={showGrid} icon={<Axis3d size={14} />} label="Grid" onChange={() => updateUi({ showGrid: !showGrid })} />
          <ToolpathControls types={toolpathTypes} muted={mutedToolpaths} soloed={soloedToolpaths} colorByType={colorToolpaths} onColorByTypeChange={(colorToolpaths) => updateUi({ colorToolpaths })} onClear={() => updateUi({ mutedToolpaths: [], soloedToolpaths: [] })} onMutedChange={(types) => updateUi({ mutedToolpaths: types })} onSoloedChange={(types) => updateUi({ soloedToolpaths: types })} />
        </div>
      </div>

      <div className={`gcode-viewport ${editMode ? 'is-editing' : ''}`}>
        <canvas ref={canvasRef} />
        {loading && <div className="gcode-loading"><Layers3 size={22} /><span>Building 3D toolpath…</span></div>}


        <div className={`gcode-stats panel ${statsCollapsed ? 'is-collapsed' : ''}`} role={isMobile ? 'button' : undefined} tabIndex={isMobile ? 0 : undefined} aria-expanded={isMobile ? !statsCollapsed : undefined} aria-label={isMobile ? `${statsCollapsed ? 'Expand' : 'Collapse'} Print Info` : undefined} onClick={toggleStats} onKeyDown={(event) => { if (isMobile && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggleStats(); } }}>
          {isMobile && statsCollapsed ? <strong className="print-info-label">Print Info</strong> : <>
            <div><span>Print time</span><strong>{stats.time}</strong></div>
            <div><span>Filament</span><strong>{stats.filament === '—' ? '—' : `${stats.filament} mm`}</strong></div>
            <div><span>Weight</span><strong>{stats.weight === '—' ? '—' : `${stats.weight} g`}</strong></div>
            <div><span>Layers</span><strong>{layerCount || '—'}</strong></div>
            <div><span>Nozzle</span><strong>{stats.nozzle === '—' ? '—' : `${stats.nozzle} mm`}</strong></div>
            <div><span>G-code</span><strong>{formatBytes(result.blob.size)}</strong></div>
            {stats.cost !== '—' && <div><span>Material cost</span><strong>{stats.cost}</strong></div>}
            {toolhead && <div className="toolhead-position"><span>Toolhead</span><strong>X{toolhead.x.toFixed(1)} Y{toolhead.y.toFixed(1)} Z{toolhead.z.toFixed(1)}</strong></div>}
          </>}
        </div>

        <CameraPresetControls expanded={expanded} viewerLabel="G-code" onToggleExpanded={onToggleExpanded} onTop={() => setCameraPreset('top')} onFront={() => setCameraPreset('front')} onRight={() => setCameraPreset('right')} onCenter={() => setCameraPreset('fit')} />

        {layerCount > 0 && (
          <div className="gcode-scrubbers">
            <label className="gcode-slider panel">
              <span>L</span>
              <strong>{layerIndex + 1}</strong>
              <input aria-label="Visible G-code layer" type="range" min="0" max={Math.max(0, layerCount - 1)} value={layerIndex} onChange={(event) => selectLayer(Number(event.target.value))} />
              <small>{layerCount}</small>
            </label>
            <label className="gcode-slider panel">
              <span>M</span>
              <strong>{moveCount}</strong>
              <input aria-label="Visible moves in layer" type="range" min="0" max={Math.max(0, movesInLayer)} value={moveCount} onChange={(event) => updateUi({ moveCount: Number(event.target.value) })} />
              <small>{movesInLayer}</small>
            </label>
          </div>
        )}

        <div className="enhance-menu">
          {enhanceOpen && (
            <div className="enhance-popover panel">
              <header><BroomSparkles size={14} /><div><strong>Enhance G-code</strong><span>Applied to the locally saved file</span></div></header>
              {enhancementOptions.map((option) => {
                const applied = result.enhancements.includes(option.id);
                const pending = enhancing === option.id;
                return (
                  <button key={option.id} type="button" disabled={applied || enhancing !== null} onClick={() => onEnhance(option.id)}>
                    <span>{option.label}<small>{option.description}</small></span>
                    {pending ? <LoaderCircle className="spin" size={14} /> : applied ? <Check size={14} /> : <BroomSparkles size={13} />}
                  </button>
                );
              })}
            </div>
          )}
          <button className={`enhance-trigger ${enhanceOpen ? 'active' : ''}`} type="button" aria-expanded={enhanceOpen} onClick={() => setEnhanceOpen((open) => !open)}>
            <BroomSparkles size={14} /> Enhance
            {result.enhancements.length > 0 && <span>{result.enhancements.length}</span>}
          </button>
        </div>

        {editMode && (
          <section className="gcode-source-overlay panel" aria-label="G-code editor">
            <header>
              <div><strong>G-code source</strong><span>{updatingSource ? 'Updating preview…' : 'Changes are saved locally'}</span></div>
              <button type="button" aria-label="Close G-code editor" onClick={() => updateUi({ editMode: false })}><X size={14} /></button>
            </header>
            <GcodeSourceEditor
              ref={editorRef}
              value={editorSource}
              onChange={setEditorSource}
              onSelectedLineChange={(lineNumber) => syncToLine(lineNumber, 'editor')}
            />
          </section>
        )}
      </div>
    </section>
  );
}

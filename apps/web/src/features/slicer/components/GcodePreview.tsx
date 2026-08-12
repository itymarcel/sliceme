import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box3, Color, ConeGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { Check, Code2, Layers3, LoaderCircle, Plane, Printer, Route, Sparkles } from 'lucide-react';

import { CameraPresetControls } from './CameraPresetControls';
import { init, type WebGLPreview } from '../lib/gcode-preview/gcode-preview';
import type { GCodeCommand, Layer } from '../lib/gcode-preview/gcode-parser';
import type { BuildVolume, GcodeEnhancement, GcodeResult } from '../types';

type CameraPreset = 'top' | 'front' | 'right' | 'fit';
type PrinterPosition = { x: number; y: number; z: number };

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

function PreviewToggle({ checked, icon, label, onChange }: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: () => void;
}) {
  return (
    <button className="preview-toggle" type="button" role="switch" aria-checked={checked} onClick={onChange}>
      {icon}<span>{label}</span><i className="toggle-track"><i /></i>
    </button>
  );
}

export function GcodePreview({ result, buildVolume, enhancing, onEnhance }: {
  result: GcodeResult;
  buildVolume: BuildVolume;
  enhancing: GcodeEnhancement | null;
  onEnhance: (operation: GcodeEnhancement) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<WebGLPreview>();
  const toolheadRef = useRef<Group>();
  const [source, setSource] = useState('');
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [layerCount, setLayerCount] = useState(0);
  const [layerIndex, setLayerIndex] = useState(0);
  const [moveCount, setMoveCount] = useState(0);
  const [movesInLayer, setMovesInLayer] = useState(0);
  const [toolhead, setToolhead] = useState<PrinterPosition | null>(null);
  const [showTravel, setShowTravel] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enhanceOpen, setEnhanceOpen] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    result.blob.text().then((text) => {
      if (!cancelled) setSource(text);
    });
    return () => { cancelled = true; };
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    const preview = init({
      canvas,
      buildVolume,
      backgroundColor: '#090d12',
      extrusionColor: ['#5fe547', '#60a5fa', '#c084fc'],
      topLayerColor: '#ecfccb',
      lastSegmentColor: '#ffffff',
      travelColor: '#fb7185',
      lineWidth: 1.5,
      renderExtrusion: true,
      renderTravel: showTravel,
      renderTubes: showPrintPreview,
      extrusionWidth: 0.6,
      devMode: false,
    });

    previewRef.current = preview;
    preview.camera.far = 100000;
    preview.camera.updateProjectionMatrix();
    preview.processGCode(source);
    const count = preview.parser.layers.length;
    const lastLayer = Math.max(0, count - 1);
    const lastLayerMoves = layerMoveCount(preview.parser.layers[lastLayer]);
    setLayerCount(count);
    setLayerIndex(lastLayer);
    setMovesInLayer(lastLayerMoves);
    setMoveCount(lastLayerMoves);
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
      preview.dispose();
      if (previewRef.current === preview) previewRef.current = undefined;
    };
  }, [applyGridVisibility, buildVolume.x, buildVolume.y, buildVolume.z, disposeToolhead, source]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !layerCount) return;
    const layer = preview.parser.layers[layerIndex];
    if (!layer) return;
    const originalCommands = layer.commands;
    layer.commands = commandsThroughMove(layer, moveCount);
    preview.endLayer = layerIndex + 2; // renderer layer zero is the G-code preamble
    preview.renderTravel = showTravel;
    preview.renderTubes = showPrintPreview;
    preview.render();
    layer.commands = originalCommands;
    applyGridVisibility(preview, showGrid);
    addToolhead(preview, toolheadAt(preview, layerIndex, moveCount));
  }, [addToolhead, applyGridVisibility, layerCount, layerIndex, moveCount, showGrid, showPrintPreview, showTravel]);

  const selectLayer = (nextLayer: number) => {
    const preview = previewRef.current;
    const bounded = Math.max(0, Math.min(layerCount - 1, nextLayer));
    const count = layerMoveCount(preview?.parser.layers[bounded]);
    setLayerIndex(bounded);
    setMovesInLayer(count);
    setMoveCount(count);
  };

  const visibleZ = previewRef.current?.parser.layers[layerIndex]?.height
    ? previewRef.current.parser.layers.slice(0, layerIndex + 1).reduce((z, current) => z + current.height, 0)
    : 0;

  return (
    <section className="gcode-preview">
      <div className="preview-toolbar">
        <div className="segmented">
          <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}><Layers3 size={14} /> Preview</button>
          <button className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}><Code2 size={14} /> Source</button>
        </div>
        <span className="preview-meta">{mode === 'preview' && layerCount > 0 ? `Layer ${layerIndex + 1}/${layerCount} · Z ${visibleZ.toFixed(2)} mm` : result.fileName}</span>
      </div>

      <div className={`gcode-viewport ${mode === 'source' ? 'is-hidden' : ''}`}>
        <canvas ref={canvasRef} />
        {loading && <div className="gcode-loading"><Layers3 size={22} /><span>Building 3D toolpath…</span></div>}

        <div className="gcode-view-controls">
          <PreviewToggle checked={showPrintPreview} icon={<Printer size={14} />} label="Print preview" onChange={() => setShowPrintPreview((value) => !value)} />
          <PreviewToggle checked={showGrid} icon={<Plane size={14} />} label="Grid" onChange={() => setShowGrid((value) => !value)} />
          <PreviewToggle checked={showTravel} icon={<Route size={14} />} label="Travel" onChange={() => setShowTravel((value) => !value)} />
        </div>

        <div className="gcode-stats panel">
          <div><span>Print time</span><strong>{stats.time}</strong></div>
          <div><span>Filament</span><strong>{stats.filament === '—' ? '—' : `${stats.filament} mm`}</strong></div>
          <div><span>Weight</span><strong>{stats.weight === '—' ? '—' : `${stats.weight} g`}</strong></div>
          <div><span>Layers</span><strong>{layerCount || '—'}</strong></div>
          <div><span>Nozzle</span><strong>{stats.nozzle === '—' ? '—' : `${stats.nozzle} mm`}</strong></div>
          <div><span>G-code</span><strong>{formatBytes(result.blob.size)}</strong></div>
          {stats.cost !== '—' && <div><span>Material cost</span><strong>{stats.cost}</strong></div>}
          {toolhead && <div className="toolhead-position"><span>Toolhead</span><strong>X{toolhead.x.toFixed(1)} Y{toolhead.y.toFixed(1)} Z{toolhead.z.toFixed(1)}</strong></div>}
        </div>

        <CameraPresetControls onTop={() => setCameraPreset('top')} onFront={() => setCameraPreset('front')} onRight={() => setCameraPreset('right')} onCenter={() => setCameraPreset('fit')} />

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
              <input aria-label="Visible moves in layer" type="range" min="0" max={Math.max(0, movesInLayer)} value={moveCount} onChange={(event) => setMoveCount(Number(event.target.value))} />
              <small>{movesInLayer}</small>
            </label>
          </div>
        )}

        <div className="enhance-menu">
          {enhanceOpen && (
            <div className="enhance-popover panel">
              <header><Sparkles size={14} /><div><strong>Enhance G-code</strong><span>Applied to this browser-session file</span></div></header>
              {enhancementOptions.map((option) => {
                const applied = result.enhancements.includes(option.id);
                const pending = enhancing === option.id;
                return (
                  <button key={option.id} type="button" disabled={applied || enhancing !== null} onClick={() => onEnhance(option.id)}>
                    <span>{option.label}<small>{option.description}</small></span>
                    {pending ? <LoaderCircle className="spin" size={14} /> : applied ? <Check size={14} /> : <Sparkles size={13} />}
                  </button>
                );
              })}
            </div>
          )}
          <button className={`enhance-trigger ${enhanceOpen ? 'active' : ''}`} type="button" aria-expanded={enhanceOpen} onClick={() => setEnhanceOpen((open) => !open)}>
            <Sparkles size={14} /> Enhance
            {result.enhancements.length > 0 && <span>{result.enhancements.length}</span>}
          </button>
        </div>
      </div>

      {mode === 'source' && <pre>{source}</pre>}
    </section>
  );
}

import type { GCodeCommand, Layer } from './gcode-preview/gcode-parser';

export type PostSliceSeverity = 'info' | 'warning' | 'error';
export type PostSliceAction = 'layer' | 'review-supports' | 'review-speed' | 'review-cooling' | 'review-retraction' | 'review-adhesion';
export type PostSliceFindingId =
  | 'unsupported-island'
  | 'long-bridge'
  | 'short-layer-time'
  | 'excessive-support'
  | 'tall-narrow'
  | 'abrupt-flow-speed'
  | 'excessive-retractions'
  | 'printable-extent-mismatch'
  | 'little-first-layer';
export type PostSliceFinding = {
  id: PostSliceFindingId;
  severity: PostSliceSeverity;
  title: string;
  explanation: string;
  layerIndex?: number;
  action: PostSliceAction;
};
export type PostSliceModelBounds = {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
};
export type PostSliceMetrics = {
  totalExtrusionLength: number;
  totalExtrusionVolume: number;
  supportExtrusionVolume: number;
  supportShare: number;
  retractions: number;
  totalTimeSeconds: number;
  layerTimesSeconds: number[];
  firstLayerExtrusionLength: number;
  firstLayerExtrusionVolume: number;
  firstLayerDepositedArea: number;
  printableBounds: PostSliceModelBounds | null;
  sampleCount: number;
};
export type PostSliceReport = {
  findings: PostSliceFinding[];
  availability: { bridgeTags: boolean };
  metrics: PostSliceMetrics;
};

type Input = {
  preamble: Layer;
  layers: Layer[];
  modelBounds?: PostSliceModelBounds | null;
  filamentDiameter?: number;
  lineWidth?: number;
};
type Point = { x: number; y: number; z: number };
type Extrusion = { layer: number; from: Point; to: Point; distance: number; e: number; volume: number; feed: number; type: string };

const MOVE_CODES = new Set(['g0', 'g00', 'g1', 'g01', 'g2', 'g02', 'g3', 'g03']);
const MAX_RASTER_SAMPLES = 100_000;
const GRID_MM = 1;
const dimensions = (bounds: PostSliceModelBounds) => ({
  x: Math.max(0, bounds.max.x - bounds.min.x),
  y: Math.max(0, bounds.max.y - bounds.min.y),
  z: Math.max(0, bounds.max.z - bounds.min.z),
});
const format = (value: number, digits = 1) => value.toFixed(digits);
const paramsOf = (command: GCodeCommand) => (command.params ?? {}) as Record<string, number | undefined>;
const pointDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const xyDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const cellKey = (x: number, y: number) => `${Math.round(x / GRID_MM)},${Math.round(y / GRID_MM)}`;
const supportType = (type: string) => /support/i.test(type);
const bridgeType = (type: string) => /bridge/i.test(type);

function connectedComponents(cells: Set<string>) {
  const remaining = new Set(cells);
  const components: Set<string>[] = [];
  while (remaining.size) {
    const seed = remaining.values().next().value as string;
    const component = new Set<string>();
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length) {
      const key = queue.pop()!;
      component.add(key);
      const [x, y] = key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = `${x + dx},${y + dy}`;
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}

function expandedHas(cells: Set<string>, key: string) {
  const [x, y] = key.split(',').map(Number);
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
    if (cells.has(`${x + dx},${y + dy}`)) return true;
  }
  return false;
}

/** Pure, bounded analysis over the parser's existing command/layer objects. */
export function analyzePostSlice(input: Input): PostSliceReport {
  const filamentDiameter = Number.isFinite(input.filamentDiameter) && (input.filamentDiameter ?? 0) > 0 ? input.filamentDiameter! : 1.75;
  const lineWidth = Number.isFinite(input.lineWidth) && (input.lineWidth ?? 0) > 0 ? input.lineWidth! : 0.4;
  const filamentArea = Math.PI * (filamentDiameter / 2) ** 2;
  const layers = [input.preamble, ...input.layers];
  const position: Point = { x: 0, y: 0, z: 0 };
  const toolExtrusion = new Map<number, number>([[0, 0]]);
  let tool = 0;
  let relativePosition = false;
  let relativeExtrusion = false;
  let volumetricExtrusion = false;
  let feed = 0;
  let retractions = 0;
  let totalTimeSeconds = 0;
  let sampleCount = 0;
  const layerTimesSeconds = Array.from({ length: input.layers.length }, () => 0);
  const extrusions: Extrusion[] = [];
  const cellsByLayer = Array.from({ length: input.layers.length }, () => new Set<string>());
  const unsupportedCellsByLayer = Array.from({ length: input.layers.length }, () => new Set<string>());
  let printableBounds: PostSliceModelBounds | null = null;
  let bridgeTags = false;

  const includePoint = (point: Point) => {
    if (!printableBounds) printableBounds = { min: { ...point }, max: { ...point } };
    else {
      printableBounds.min.x = Math.min(printableBounds.min.x, point.x);
      printableBounds.min.y = Math.min(printableBounds.min.y, point.y);
      printableBounds.min.z = Math.min(printableBounds.min.z, point.z);
      printableBounds.max.x = Math.max(printableBounds.max.x, point.x);
      printableBounds.max.y = Math.max(printableBounds.max.y, point.y);
      printableBounds.max.z = Math.max(printableBounds.max.z, point.z);
    }
  };

  layers.forEach((layer, parserLayer) => {
    const layerIndex = parserLayer - 1;
    layer.commands.forEach((command) => {
      const params = paramsOf(command);
      const code = command.gcode.toLowerCase();
      bridgeTags ||= Boolean(command.toolpathType);
      if (/^t\d+$/.test(code)) {
        tool = Number(code.slice(1));
        if (!toolExtrusion.has(tool)) toolExtrusion.set(tool, 0);
      }
      if (code === 'g90') relativePosition = false;
      if (code === 'g91') relativePosition = true;
      if (code === 'm82') relativeExtrusion = false;
      if (code === 'm83') relativeExtrusion = true;
      if (code === 'm200' && params.d !== undefined) volumetricExtrusion = params.d > 0;
      if (code === 'g10') retractions += 1;
      if (code === 'g92') {
        if (params.x !== undefined) position.x = params.x;
        if (params.y !== undefined) position.y = params.y;
        if (params.z !== undefined) position.z = params.z;
        if (params.e !== undefined) toolExtrusion.set(tool, params.e);
        return;
      }
      if (!MOVE_CODES.has(code)) return;
      if (params.f !== undefined && params.f > 0) feed = params.f;
      const from = { ...position };
      const to = {
        x: params.x === undefined ? position.x : relativePosition ? position.x + params.x : params.x,
        y: params.y === undefined ? position.y : relativePosition ? position.y + params.y : params.y,
        z: params.z === undefined ? position.z : relativePosition ? position.z + params.z : params.z,
      };
      const oldE = toolExtrusion.get(tool) ?? 0;
      const nextE = params.e === undefined ? oldE : relativeExtrusion ? oldE + params.e : params.e;
      const eDelta = params.e === undefined ? 0 : nextE - oldE;
      if (eDelta < -1e-6) retractions += 1;
      const distance = pointDistance(from, to);
      const timedDistance = distance > 0 ? distance : Math.abs(eDelta);
      if (feed > 0 && timedDistance > 0) {
        const seconds = timedDistance / feed * 60;
        totalTimeSeconds += seconds;
        if (layerIndex >= 0) layerTimesSeconds[layerIndex] += seconds;
      }
      const planarDistance = xyDistance(from, to);
      if (layerIndex >= 0 && eDelta > 1e-6 && planarDistance > 1e-6) {
        const type = command.toolpathType?.trim() ?? '';
        bridgeTags ||= bridgeType(type);
        const volume = volumetricExtrusion ? eDelta : eDelta * filamentArea;
        extrusions.push({ layer: layerIndex, from, to, distance: planarDistance, e: eDelta, volume, feed, type });
        includePoint(from);
        includePoint(to);
        const remaining = MAX_RASTER_SAMPLES - sampleCount;
        const steps = Math.min(remaining, Math.max(1, Math.ceil(planarDistance / GRID_MM)));
        for (let index = 0; index <= steps && sampleCount < MAX_RASTER_SAMPLES; index += 1) {
          const t = steps ? index / steps : 0;
          const key = cellKey(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
          cellsByLayer[layerIndex].add(key);
          if (!bridgeType(type)) unsupportedCellsByLayer[layerIndex].add(key);
          sampleCount += 1;
        }
      }
      Object.assign(position, to);
      if (params.e !== undefined) toolExtrusion.set(tool, nextE);
    });
  });

  const totalExtrusionLength = extrusions.reduce((sum, move) => sum + move.e, 0);
  const totalExtrusionVolume = extrusions.reduce((sum, move) => sum + move.volume, 0);
  const supportExtrusionVolume = extrusions.filter((move) => supportType(move.type)).reduce((sum, move) => sum + move.volume, 0);
  const supportShare = totalExtrusionVolume > 0 ? supportExtrusionVolume / totalExtrusionVolume : 0;
  const firstLayer = extrusions.filter((move) => move.layer === 0);
  const firstLayerExtrusionLength = firstLayer.reduce((sum, move) => sum + move.e, 0);
  const firstLayerExtrusionVolume = firstLayer.reduce((sum, move) => sum + move.volume, 0);
  const firstLayerDepositedArea = (cellsByLayer[0]?.size ?? 0) * GRID_MM * lineWidth;
  const metrics: PostSliceMetrics = {
    totalExtrusionLength, totalExtrusionVolume, supportExtrusionVolume, supportShare, retractions,
    totalTimeSeconds, layerTimesSeconds, firstLayerExtrusionLength, firstLayerExtrusionVolume,
    firstLayerDepositedArea, printableBounds, sampleCount,
  };
  const findings: PostSliceFinding[] = [];

  let unsupported: { layer: number; overlap: number; length: number } | null = null;
  for (let layer = 1; layer < unsupportedCellsByLayer.length; layer += 1) {
    const cells = unsupportedCellsByLayer[layer];
    const prior = cellsByLayer[layer - 1];
    if (cells.size < 8 || !prior.size) continue;
    for (const component of connectedComponents(cells)) {
      const length = component.size * GRID_MM;
      if (length < 8) continue;
      const overlap = [...component].filter((key) => expandedHas(prior, key)).length / component.size;
      if (overlap < 0.05 && (!unsupported || overlap < unsupported.overlap)) unsupported = { layer, overlap, length };
    }
  }
  if (unsupported) findings.push({
    id: 'unsupported-island', severity: 'warning', title: 'Possible unsupported island', layerIndex: unsupported.layer, action: 'layer',
    explanation: `Layer ${unsupported.layer + 1} has a detached path component with only ${format(unsupported.overlap * 100, 0)}% sampled overlap below across ~${format(unsupported.length)} mm. This is a toolpath-overlap approximation, not geometric certainty.`,
  });

  const longestBridge = extrusions
    .filter((move) => bridgeType(move.type))
    .reduce<{ length: number; layer: number } | null>(
      (longest, move) => !longest || move.distance > longest.length ? { length: move.distance, layer: move.layer } : longest,
      null,
    );
  if (longestBridge && longestBridge.length >= 20) findings.push({
    id: 'long-bridge', severity: 'warning', title: 'Long tagged bridge', layerIndex: longestBridge.layer, action: 'layer',
    explanation: `Orca tagged a ${format(longestBridge.length)} mm bridge segment on layer ${longestBridge.layer + 1}; spans at or above 20 mm merit preview review.`,
  });

  const shortLayers = layerTimesSeconds.map((seconds, layer) => ({ seconds, layer })).filter(({ seconds }) => seconds > 0 && seconds < 5);
  if (shortLayers.length) {
    const shortest = shortLayers.reduce((best, value) => value.seconds < best.seconds ? value : best);
    findings.push({
      id: 'short-layer-time', severity: 'warning', title: 'Very short layer time', layerIndex: shortest.layer, action: 'review-cooling',
      explanation: `${shortLayers.length} layer${shortLayers.length === 1 ? '' : 's'} calculate below 5 s; layer ${shortest.layer + 1} is ${format(shortest.seconds)} s from parsed move distances and feedrates.`,
    });
  }

  if (supportShare >= 0.35 && supportExtrusionVolume >= 500) findings.push({
    id: 'excessive-support', severity: 'warning', title: 'High support material share', action: 'review-supports',
    explanation: `Support-tagged extrusion is ${format(supportShare * 100, 0)}% (${format(supportExtrusionVolume, 0)} mm³) of parsed extrusion; threshold is 35% and 500 mm³.`,
  });

  if (input.modelBounds) {
    const model = dimensions(input.modelBounds);
    const narrow = Math.min(model.x, model.y);
    if (model.z >= 80 && narrow <= 25 && model.z / Math.max(narrow, 0.01) >= 4) findings.push({
      id: 'tall-narrow', severity: 'warning', title: 'Tall, narrow geometry', action: 'review-adhesion',
      explanation: `Transformed model bounds are ${format(model.z)} mm tall with a ${format(model.x)} × ${format(model.y)} mm footprint (${format(model.z / Math.max(narrow, 0.01))}:1 height-to-narrow-side ratio).`,
    });
    if (printableBounds) {
      const output = dimensions(printableBounds);
      const axes = (['x', 'y', 'z'] as const).flatMap((axis) => {
        const absolute = Math.abs(output[axis] - model[axis]);
        const relative = absolute / Math.max(model[axis], 1);
        return absolute >= 5 && relative >= 0.2 ? [`${axis.toUpperCase()} ${format(model[axis])}→${format(output[axis])} mm`] : [];
      });
      if (axes.length) findings.push({
        id: 'printable-extent-mismatch', severity: 'warning', title: 'Model/output extent differs', action: 'layer',
        explanation: `Extruding toolpath extent differs from transformed model bounds by at least 20% and 5 mm: ${axes.join(', ')}. Skirts, supports, or wipe structures can explain this.`,
      });
    }
    const modelFootprint = model.x * model.y;
    if (modelFootprint >= 400 && firstLayerExtrusionLength < 25 && firstLayerDepositedArea < modelFootprint * 0.02) findings.push({
      id: 'little-first-layer', severity: 'warning', title: 'Very little first-layer material', layerIndex: 0, action: 'review-adhesion',
      explanation: `Layer 1 has ${format(firstLayerExtrusionLength)} mm extrusion (${format(firstLayerExtrusionVolume)} mm³; ~${format(firstLayerDepositedArea)} mm² deposited path area) versus a ${format(modelFootprint, 0)} mm² transformed footprint.`,
    });
  }

  let abrupt = 0;
  let previous: Extrusion | null = null;
  extrusions.forEach((move) => {
    if (move.distance < 1 || move.e <= 0) return;
    if (previous && previous.distance >= 1) {
      const speedA = previous.feed / 60;
      const speedB = move.feed / 60;
      const flowA = previous.e / previous.distance;
      const flowB = move.e / move.distance;
      const speedRatio = Math.max(speedA, speedB) / Math.max(Math.min(speedA, speedB), 0.01);
      const flowRatio = Math.max(flowA, flowB) / Math.max(Math.min(flowA, flowB), 0.0001);
      if ((speedRatio >= 2.5 && Math.abs(speedA - speedB) >= 40) || flowRatio >= 3) abrupt += 1;
    }
    previous = move;
  });
  if (abrupt >= 4) findings.push({
    id: 'abrupt-flow-speed', severity: 'warning', title: 'Repeated abrupt flow/speed changes', action: 'review-speed',
    explanation: `${abrupt} abrupt transitions exceed 2.5× speed with ≥40 mm/s change or 3× extrusion-per-distance between consecutive extrusion moves.`,
  });

  const minutes = totalTimeSeconds / 60;
  const retractionsPerMinute = minutes > 0 ? retractions / minutes : 0;
  if (retractions >= 100 && retractionsPerMinute >= 2) findings.push({
    id: 'excessive-retractions', severity: 'warning', title: 'Frequent retractions', action: 'review-retraction',
    explanation: `${retractions} retractions were parsed (${format(retractionsPerMinute)} per calculated minute) from E reversals and G10 commands; thresholds are 100 and 2/min.`,
  });

  return { findings, availability: { bridgeTags }, metrics };
}

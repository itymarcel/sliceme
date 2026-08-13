import type { Layer } from './gcode-preview/gcode-parser';

export function toolpathTypesFromLayers(layers: Layer[]) {
  return [...new Set(layers.flatMap((layer) => layer.commands.map((command) => command.toolpathType).filter((type): type is string => Boolean(type))))];
}

export function isToolpathVisible(type: string | undefined, muted: string[], soloed: string[]) {
  if (soloed.length > 0) return type !== undefined && soloed.includes(type);
  return type === undefined || !muted.includes(type);
}
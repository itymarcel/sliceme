import type { Layer } from './gcode-preview/gcode-parser';

export function toolpathTypesFromLayers(layers: Layer[]) {
  return [...new Set(layers.flatMap((layer) => layer.commands.map((command) => command.toolpathType).filter((type): type is string => Boolean(type))))];
}

export function isToolpathVisible(type: string | undefined, muted: string[], soloed: string[]) {
  if (soloed.length > 0) return type !== undefined && soloed.includes(type);
  return type === undefined || !muted.includes(type);
}

const colors: Record<string, string> = {
  'travel moves': '#fb7185',
  'outer wall': '#facc15',
  'inner wall': '#60a5fa',
  'sparse infill': '#c084fc',
  'internal solid infill': '#f97316',
  'top surface': '#5fe547',
  'bottom surface': '#2dd4bf',
  support: '#22d3ee',
  'support interface': '#38bdf8',
  bridge: '#f472b6',
};
const fallbackColors = ['#facc15', '#60a5fa', '#c084fc', '#5fe547', '#f97316', '#2dd4bf', '#22d3ee', '#f472b6'];

export function toolpathColor(type: string) {
  const normalized = type.toLowerCase();
  const known = Object.entries(colors).find(([key]) => normalized === key || normalized.includes(key));
  if (known) return known[1];
  const hash = [...normalized].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return fallbackColors[hash % fallbackColors.length];
}

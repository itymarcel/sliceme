export type PrinterPreset = {
  id: string;
  manufacturer: string;
  name: string;
};

export const printerPresets: PrinterPreset[] = [
  { id: 'bambu-a1', manufacturer: 'Bambu Lab', name: 'A1' },
  { id: 'bambu-a1-mini', manufacturer: 'Bambu Lab', name: 'A1 mini' },
  { id: 'bambu-p1s', manufacturer: 'Bambu Lab', name: 'P1S' },
  { id: 'bambu-x1c', manufacturer: 'Bambu Lab', name: 'X1 Carbon' },
  { id: 'prusa-mk4s', manufacturer: 'Prusa', name: 'MK4S' },
  { id: 'creality-ender-3-v3-se', manufacturer: 'Creality', name: 'Ender-3 V3 SE' },
  { id: 'creality-k1c', manufacturer: 'Creality', name: 'K1C' },
  { id: 'elegoo-neptune-4-pro', manufacturer: 'Elegoo', name: 'Neptune 4 Pro' },
  { id: 'anycubic-kobra-3', manufacturer: 'Anycubic', name: 'Kobra 3' },
];

export const PRINTER_PRESET_CONFIG_KEY = 'sliceme_printer_preset';

export function machineConfigForPreset(id: string): Record<string, unknown> {
  if (!printerPresets.some((item) => item.id === id)) throw new Error(`Unknown printer preset: ${id}`);
  return { [PRINTER_PRESET_CONFIG_KEY]: id };
}

export function findMatchingPrinterPreset(machineConfig: Record<string, unknown>) {
  const id = String(machineConfig[PRINTER_PRESET_CONFIG_KEY] ?? '');
  return printerPresets.some((preset) => preset.id === id) ? id : 'custom';
}

export type BuildDimension = 'width' | 'depth' | 'height';
export type BuildDimensions = { width: number; depth: number; height: number };

function printableBounds(machineConfig: Record<string, unknown>) {
  const points = Array.isArray(machineConfig.printable_area) ? machineConfig.printable_area : [];
  const coordinates = points.flatMap((point) => {
    const [rawX, rawY] = String(point).split('x');
    const x = Number(rawX);
    const y = Number(rawY);
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
  const xs = coordinates.map(({ x }) => x);
  const ys = coordinates.map(({ y }) => y);
  return {
    minX: xs.length ? Math.min(...xs) : 0,
    maxX: xs.length ? Math.max(...xs) : 250,
    minY: ys.length ? Math.min(...ys) : 0,
    maxY: ys.length ? Math.max(...ys) : 210,
  };
}

export function buildDimensionsFromMachineConfig(machineConfig: Record<string, unknown>): BuildDimensions {
  const { minX, maxX, minY, maxY } = printableBounds(machineConfig);
  return {
    width: maxX - minX,
    depth: maxY - minY,
    height: Number(machineConfig.printable_height) || 210,
  };
}

export function machineConfigWithBuildDimension(
  machineConfig: Record<string, unknown>,
  dimension: BuildDimension,
  value: number,
): Record<string, unknown> {
  if (!Number.isFinite(value) || value <= 0) return machineConfig;
  if (dimension === 'height') return { ...machineConfig, printable_height: String(value) };

  const bounds = printableBounds(machineConfig);
  const maxX = dimension === 'width' ? bounds.minX + value : bounds.maxX;
  const maxY = dimension === 'depth' ? bounds.minY + value : bounds.maxY;
  return {
    ...machineConfig,
    printable_area: [
      `${bounds.minX}x${bounds.minY}`,
      `${maxX}x${bounds.minY}`,
      `${maxX}x${maxY}`,
      `${bounds.minX}x${maxY}`,
    ],
  };
}

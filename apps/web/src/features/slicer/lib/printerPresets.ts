import type { PrintPreset, PrinterPreset } from '../types';

export const PRINTER_PRESET_CONFIG_KEY = 'sliceme_printer_preset';
export const PRINT_PRESET_CONFIG_KEY = 'sliceme_print_preset';

export function machineConfigForPreset(id: string, profileConfig: Record<string, unknown>): Record<string, unknown> {
  return { ...profileConfig, [PRINTER_PRESET_CONFIG_KEY]: id };
}

export function findMatchingPrinterPreset(machineConfig: Record<string, unknown>, presets: PrinterPreset[]) {
  const id = String(machineConfig[PRINTER_PRESET_CONFIG_KEY] ?? '');
  return presets.some((preset) => preset.id === id) ? id : 'custom';
}

export function printConfigForPreset(id: string, profileConfig: Record<string, unknown>): Record<string, unknown> {
  return { ...profileConfig, [PRINT_PRESET_CONFIG_KEY]: id };
}

export function findMatchingPrintPreset(processConfig: Record<string, unknown>, presets: PrintPreset[]) {
  const id = String(processConfig[PRINT_PRESET_CONFIG_KEY] ?? '');
  return presets.some((preset) => preset.id === id) ? id : 'custom';
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

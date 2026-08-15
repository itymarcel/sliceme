import { describe, expect, it } from 'vitest';

import {
  buildDimensionsFromMachineConfig,
  findMatchingPrinterPreset,
  machineConfigForPreset,
  machineConfigWithBuildDimension,
  printerPresets,
} from './printerPresets';

describe('printer presets', () => {
  it('stores only the target printer preset id', () => {
    expect(machineConfigForPreset('bambu-a1')).toEqual({
      sliceme_printer_preset: 'bambu-a1',
    });
  });

  it('recognizes the persisted preset independently of dimensions and nozzle', () => {
    const config = {
      ...machineConfigForPreset('prusa-mk4s'),
      printable_area: ['0x0', '123x0', '123x456', '0x456'],
      printable_height: '789',
      nozzle_diameter: ['0.8'],
    };
    expect(findMatchingPrinterPreset(config)).toBe('prusa-mk4s');
    expect(findMatchingPrinterPreset({ ...config, sliceme_printer_preset: '' })).toBe('custom');
  });

  it('keeps separate presets for printers with different target G-code', () => {
    expect(printerPresets.map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'bambu-a1', 'bambu-a1-mini', 'bambu-p1s', 'bambu-x1c',
      'prusa-mk4s', 'creality-ender-3-v3-se', 'creality-k1c',
      'elegoo-neptune-4-pro', 'anycubic-kobra-3',
    ]));
  });
});

describe('independent build dimensions', () => {
  const machine = {
    printable_area: ['10x20', '260x20', '260x230', '10x230'],
    printable_height: '220',
    sliceme_printer_preset: 'prusa-mk4s',
  };

  it('reads width, depth, and height from Orca machine geometry', () => {
    expect(buildDimensionsFromMachineConfig(machine)).toEqual({ width: 250, depth: 210, height: 220 });
  });

  it('updates width without changing origin, depth, height, or printer preset', () => {
    expect(machineConfigWithBuildDimension(machine, 'width', 300)).toEqual({
      ...machine,
      printable_area: ['10x20', '310x20', '310x230', '10x230'],
    });
  });

  it('updates depth and height independently', () => {
    expect(machineConfigWithBuildDimension(machine, 'depth', 300).printable_area)
      .toEqual(['10x20', '260x20', '260x320', '10x320']);
    expect(machineConfigWithBuildDimension(machine, 'height', 300)).toEqual({
      ...machine,
      printable_height: '300',
    });
  });
});

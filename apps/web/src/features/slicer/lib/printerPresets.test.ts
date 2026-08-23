import { describe, expect, it } from 'vitest';

import {
  buildDimensionsFromMachineConfig,
  findMatchingPrinterPreset,
  findMatchingPrintPreset,
  machineConfigForPreset,
  machineConfigWithBuildDimension,
  printConfigForPreset,
} from './printerPresets';

const catalog = [{ id: 'prusa-id', manufacturer: 'Prusa', name: 'MK4S 0.4 nozzle', model: 'MK4S', nozzle_diameter: ['0.4'] }];

describe('printer presets', () => {
  it('applies the complete machine profile and stores its stable id', () => {
    expect(machineConfigForPreset('prusa-id', {
      printable_area: ['0x0', '250x0', '250x210', '0x210'],
      printable_height: '220',
      nozzle_diameter: ['0.4'],
      machine_start_gcode: 'START',
    })).toEqual({
      printable_area: ['0x0', '250x0', '250x210', '0x210'],
      printable_height: '220',
      nozzle_diameter: ['0.4'],
      machine_start_gcode: 'START',
      sliceme_printer_preset: 'prusa-id',
    });
  });

  it('recognizes a persisted printer id only when it remains in the loaded catalog', () => {
    const config = { sliceme_printer_preset: 'prusa-id' };
    expect(findMatchingPrinterPreset(config, catalog)).toBe('prusa-id');
    expect(findMatchingPrinterPreset(config, [])).toBe('custom');
  });

  it('marks a complete print-profile replacement with its preset id', () => {
    const process = printConfigForPreset('standard', { layer_height: '0.2', wall_loops: '3' });
    expect(process).toEqual({ layer_height: '0.2', wall_loops: '3', sliceme_print_preset: 'standard' });
    expect(findMatchingPrintPreset(process, [{ id: 'standard', name: 'Standard', description: 'Balanced' }])).toBe('standard');
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

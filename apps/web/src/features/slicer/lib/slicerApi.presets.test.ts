// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadPrintPreset, loadPrintPresets, loadPrinterPreset, loadPrinterPresets } from './slicerApi';

afterEach(() => vi.unstubAllGlobals());

describe('profile API', () => {
  it('loads the broad printer catalog and a complete machine profile', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ presets: [{ id: 'printer-id', manufacturer: 'Maker', name: 'Printer', model: 'Printer', nozzle_diameter: ['0.4'] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ machine_config: { printable_height: '250', machine_start_gcode: 'START' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const presets = await loadPrinterPresets();
    const machine = await loadPrinterPreset('printer-id');

    expect(presets[0].manufacturer).toBe('Maker');
    expect(machine.printable_height).toBe('250');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/printer-presets/printer-id', { signal: undefined });
  });

  it('loads print presets and their complete replacement process config', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ presets: [{ id: 'standard', name: 'Standard', description: 'Balanced' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ process_config: { layer_height: '0.2', wall_loops: '3' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const presets = await loadPrintPresets();
    const process = await loadPrintPreset('standard');

    expect(presets[0].description).toBe('Balanced');
    expect(process).toEqual({ layer_height: '0.2', wall_loops: '3' });
  });
});

// @vitest-environment jsdom
import { unzipSync, strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifySliceFailure, requestProjectExport, requestProjectImport, summarizeSliceFailure } from './slicerApi';
import type { SliceManifest, SlicerModel } from '../types';

const config = { machine_config: { nozzle_diameter: '0.8' }, process_config: {}, filament_config: {} };
const manifest: SliceManifest = {
  models: [{ id: 'model-1', name: 'part.stl' }],
  config,
  fileOverrides: {}, rangeOverrides: {}, transforms: {}, customGcodeForZ: [], startPositions: {},
};
const modelFile = new File([new Uint8Array(84)], 'part.stl', { type: 'model/stl' });
const model: SlicerModel = { fileId: 'model-1', fileName: 'part.stl', fileSize: modelFile.size, objectUrl: 'blob:model', file: modelFile };

afterEach(() => vi.unstubAllGlobals());

describe('Orca 3MF project API', () => {
  it('extracts the concise Orca validation reason from verbose slice output', () => {
    expect(summarizeSliceFailure('OrcaSlicer exited with code 205: [error] got error when validate: Too large line width Too large line width')).toBe('Too large line width');
  });

  it('normalizes telemetry failures without retaining model filenames or server error text', () => {
    const failure = classifySliceFailure('OrcaSlicer exited with code 205: failed to process /tmp/job/private-client-name.stl');

    expect(failure).toBe('slicer_exit_205');
    expect(failure).not.toContain('private-client-name.stl');
  });

  it('imports extracted models and settings from the API package', async () => {
    const packageBytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ config, models: [
        { path: 'models/0.stl', name: 'part.stl', position: { x: 100, y: 90 }, overrides: { process_config: { layer_height: '0.16' } }, rangeOverrides: [{ range: { min_z: 2, max_z: 8 }, machine_config: {}, process_config: { layer_height: '0.12' }, filament_config: {} }], modifierForIndex: null },
        { path: 'models/1.stl', name: 'modifier.stl', position: { x: 104, y: 94, z: 5 }, overrides: { process_config: { sparse_infill_density: '80%' } }, modifierForIndex: 0 },
      ] })),
      'models/0.stl': new Uint8Array(84),
      'models/1.stl': new Uint8Array(84),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(packageBytes, { status: 200 })));

    const result = await requestProjectImport(new File([new Uint8Array([1])], 'orca.3mf'));

    expect(result.config.machine_config.nozzle_diameter).toBe('0.8');
    expect(result.models[0].file.name).toBe('part.stl');
    expect(result.models[0].position).toEqual({ x: 100, y: 90 });
    expect(result.models[0].overrides.process_config?.layer_height).toBe('0.16');
    expect(result.models[0].rangeOverrides[0].process_config.layer_height).toBe('0.12');
    expect(result.models[1].modifierForIndex).toBe(0);
    expect(result.models[1].position.z).toBe(5);
    expect(result.models[1].overrides.process_config?.sparse_infill_density).toBe('80%');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/import-project', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects malformed model metadata from the import response', async () => {
    const packageBytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ config, models: [{ path: '../escape.stl', name: 'part.stl', position: { x: 0, y: 0 } }] })),
      '../escape.stl': new Uint8Array(84),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(packageBytes, { status: 200 })));

    await expect(requestProjectImport(new File([new Uint8Array([1])], 'orca.3mf')))
      .rejects.toThrow('invalid model metadata');
  });

  it('exports the current models and settings as a named 3MF blob', async () => {
    const projectBytes = zipSync({ '3D/3dmodel.model': strToU8('<model/>') });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(projectBytes, {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="sliceme-project.3mf"' },
    })));

    const result = await requestProjectExport(manifest, [model]);

    expect(result.fileName).toBe('sliceme-project.3mf');
    expect(unzipSync(new Uint8Array(await result.blob.arrayBuffer()))['3D/3dmodel.model']).toBeDefined();
    const request = vi.mocked(fetch).mock.calls[0];
    expect(request[0]).toBe('/api/export-project');
    expect((request[1]?.body as FormData).get('manifest')).toBe(JSON.stringify(manifest));
  });
});

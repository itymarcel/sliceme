// @vitest-environment jsdom
import { unzipSync, strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestProjectExport, requestProjectImport } from './slicerApi';
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
  it('imports extracted models and settings from the API package', async () => {
    const packageBytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ config, models: [{ path: 'models/0.stl', name: 'part.stl', position: { x: 100, y: 90 } }] })),
      'models/0.stl': new Uint8Array(84),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(packageBytes, { status: 200 })));

    const result = await requestProjectImport(new File([new Uint8Array([1])], 'orca.3mf'));

    expect(result.config.machine_config.nozzle_diameter).toBe('0.8');
    expect(result.models[0].file.name).toBe('part.stl');
    expect(result.models[0].position).toEqual({ x: 100, y: 90 });
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

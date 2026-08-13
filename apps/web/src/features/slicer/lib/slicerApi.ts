import { strFromU8, unzipSync } from 'fflate';

import type { ConfigBundle, GcodeEnhancement, GcodeResult, SlicerRecommendation, SliceManifest, SlicerModel } from '../types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

const readError = async (response: Response) => {
  try {
    const body = await response.json();
    return body.detail ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

export async function loadDefaultConfig(signal?: AbortSignal): Promise<ConfigBundle> {
  const response = await fetch(`${apiBase}/api/default-config`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function requestSettingsPrefill(description: string, config: ConfigBundle, signal?: AbortSignal): Promise<SlicerRecommendation> {
  const response = await fetch(`${apiBase}/api/prefill-settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, config }),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function requestSlice(
  manifest: SliceManifest,
  models: SlicerModel[],
  signal?: AbortSignal,
): Promise<GcodeResult> {
  const body = new FormData();
  body.append('manifest', JSON.stringify(manifest));
  models.forEach((model) => body.append('models', model.file, model.fileName));
  const response = await fetch(`${apiBase}/api/slice`, { method: 'POST', body, signal });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'slice.gcode';
  return { blob, fileName, url: URL.createObjectURL(blob), enhancements: [] };
}

export async function requestEnhancement(
  result: GcodeResult,
  operation: GcodeEnhancement,
  signal?: AbortSignal,
): Promise<GcodeResult> {
  const body = new FormData();
  body.append('operation', operation);
  body.append('gcode', result.blob, result.fileName);
  const response = await fetch(`${apiBase}/api/enhance`, { method: 'POST', body, signal });
  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  return {
    blob,
    fileName: result.fileName,
    url: URL.createObjectURL(blob),
    enhancements: [...result.enhancements, operation],
  };
}

export type ImportedProject = {
  config: ConfigBundle;
  models: Array<{ file: File; position: { x: number; y: number } }>;
  warnings: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseImportedManifest(value: unknown) {
  if (!isRecord(value) || !isRecord(value.config) || !Array.isArray(value.models)) {
    throw new Error('Imported project response has an invalid manifest');
  }
  const config = value.config;
  if (!isRecord(config.machine_config) || !isRecord(config.process_config) || !isRecord(config.filament_config)) {
    throw new Error('Imported project response has invalid settings');
  }
  if (value.models.length < 1 || value.models.length > 12) {
    throw new Error('Imported project response has an invalid model count');
  }
  const models = value.models.map((model, index) => {
    if (!isRecord(model) || typeof model.path !== 'string' || !new RegExp(`^models/${index}\\.stl$`).test(model.path)
      || typeof model.name !== 'string' || model.name.length < 1 || model.name.length > 255
      || !isRecord(model.position) || typeof model.position.x !== 'number' || typeof model.position.y !== 'number'
      || !Number.isFinite(model.position.x) || !Number.isFinite(model.position.y)) {
      throw new Error('Imported project response contains invalid model metadata');
    }
    return { path: model.path, name: model.name, position: { x: model.position.x, y: model.position.y } };
  });
  if (value.warnings !== undefined && (!Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== 'string'))) {
    throw new Error('Imported project response has invalid warnings');
  }
  return { config: config as ConfigBundle, models, warnings: (value.warnings ?? []) as string[] };
}

export async function requestProjectImport(project: File, signal?: AbortSignal): Promise<ImportedProject> {
  const body = new FormData();
  body.append('project', project, project.name);
  const response = await fetch(`${apiBase}/api/import-project`, { method: 'POST', body, signal });
  if (!response.ok) throw new Error(await readError(response));
  const packageFiles = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const manifestBytes = packageFiles['manifest.json'];
  if (!manifestBytes) throw new Error('Imported project response has no manifest');
  const manifest = parseImportedManifest(JSON.parse(strFromU8(manifestBytes)));
  return {
    config: manifest.config,
    warnings: manifest.warnings ?? [],
    models: manifest.models.map((model) => {
      const bytes = packageFiles[model.path];
      if (!bytes) throw new Error(`Imported project is missing ${model.path}`);
      return { file: new File([bytes], model.name, { type: 'model/stl' }), position: model.position };
    }),
  };
}

export async function requestProjectExport(
  manifest: SliceManifest,
  models: SlicerModel[],
  signal?: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> {
  const body = new FormData();
  body.append('manifest', JSON.stringify(manifest));
  body.append('fileName', models[0]?.fileName.replace(/\.[^.]+$/, '') || 'sliceme-project');
  models.forEach((model) => body.append('models', model.file, model.fileName));
  const response = await fetch(`${apiBase}/api/export-project`, { method: 'POST', body, signal });
  if (!response.ok) throw new Error(await readError(response));
  const disposition = response.headers.get('content-disposition') ?? '';
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'sliceme-project.3mf';
  return { blob: await response.blob(), fileName };
}

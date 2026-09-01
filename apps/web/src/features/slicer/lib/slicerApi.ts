import { strFromU8, unzipSync } from 'fflate';

import type { ConfigBundle, GcodeEnhancement, GcodeResult, PrintPreset, PrinterPreset, RangeOverride, SlicerRecommendation, SliceManifest, SlicerModel } from '../types';
import { recordUsageEvent } from '../hooks/useUsageSession';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

const readError = async (response: Response) => {
  try {
    const body = await response.json();
    return body.detail ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

export function summarizeSliceFailure(raw: string): string {
  const validation = raw.match(/got error when validate:\s*(.*?)(?=\s+\[?\d{4}-\d{2}-\d{2}|\s+record_exit_reson|$)/i)?.[1];
  const candidate = (validation ?? raw.replace(/^OrcaSlicer exited with code \d+:\s*/i, '').split(/\s+\[?\d{4}-\d{2}-\d{2}/)[0]).trim();
  const words = candidate.split(/\s+/);
  const midpoint = Math.floor(words.length / 2);
  const firstHalf = words.slice(0, midpoint).join(' ');
  const secondHalf = words.slice(midpoint).join(' ');
  return (firstHalf && firstHalf === secondHalf ? firstHalf : candidate).slice(0, 500) || 'Unknown slice error';
}

export async function loadDefaultConfig(signal?: AbortSignal): Promise<ConfigBundle> {
  const response = await fetch(`${apiBase}/api/default-config`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function loadPrinterPresets(signal?: AbortSignal): Promise<PrinterPreset[]> {
  const response = await fetch(`${apiBase}/api/printer-presets`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  return body.presets;
}

export async function loadPrinterPreset(presetId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBase}/api/printer-presets/${encodeURIComponent(presetId)}`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  return body.machine_config;
}

export async function loadPrintPresets(signal?: AbortSignal): Promise<PrintPreset[]> {
  const response = await fetch(`${apiBase}/api/print-presets`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  return body.presets;
}

export async function loadPrintPreset(presetId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBase}/api/print-presets/${encodeURIComponent(presetId)}`, { signal });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json();
  return body.process_config;
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
  recordUsageEvent('slice_triggered');
  try {
    const response = await fetch(`${apiBase}/api/slice`, { method: 'POST', body, signal });
    if (!response.ok) throw new Error(await readError(response));
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'slice.gcode';
    recordUsageEvent('slice_succeeded', true);
    return { blob, fileName, url: URL.createObjectURL(blob), enhancements: [] };
  } catch (error) {
    recordUsageEvent('slice_failed', false, summarizeSliceFailure(error instanceof Error ? error.message : 'Unknown slice error'));
    throw error;
  }
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
  models: Array<{
    file: File;
    position: { x: number; y: number; z?: number };
    overrides: Partial<ConfigBundle>;
    rangeOverrides: RangeOverride[];
    modifierForIndex: number | null;
  }>;
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
      || !Number.isFinite(model.position.x) || !Number.isFinite(model.position.y)
      || (model.position.z !== undefined && (typeof model.position.z !== 'number' || !Number.isFinite(model.position.z)))) {
      throw new Error('Imported project response contains invalid model metadata');
    }
    const overrides = model.overrides === undefined ? {} : model.overrides;
    const rangeOverrides = model.rangeOverrides === undefined ? [] : model.rangeOverrides;
    const modifierForIndex = model.modifierForIndex === undefined ? null : model.modifierForIndex;
    const validRangeOverrides = Array.isArray(rangeOverrides) && rangeOverrides.every((range) => isRecord(range)
      && isRecord(range.range) && typeof range.range.min_z === 'number' && Number.isFinite(range.range.min_z)
      && typeof range.range.max_z === 'number' && Number.isFinite(range.range.max_z)
      && isRecord(range.machine_config) && isRecord(range.process_config) && isRecord(range.filament_config));
    if (!isRecord(overrides)
      || Object.entries(overrides).some(([section, settings]) => !['machine_config', 'process_config', 'filament_config'].includes(section) || !isRecord(settings))
      || !validRangeOverrides
      || (modifierForIndex !== null && (!Number.isInteger(modifierForIndex) || (modifierForIndex as number) < 0 || (modifierForIndex as number) >= index))) {
      throw new Error('Imported project response contains invalid model metadata');
    }
    return {
      path: model.path,
      name: model.name,
      position: { x: model.position.x, y: model.position.y, ...(typeof model.position.z === 'number' ? { z: model.position.z } : {}) },
      overrides: overrides as Partial<ConfigBundle>,
      rangeOverrides: rangeOverrides as RangeOverride[],
      modifierForIndex: modifierForIndex as number | null,
    };
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
      return {
        file: new File([bytes], model.name, { type: 'model/stl' }),
        position: model.position,
        overrides: model.overrides,
        rangeOverrides: model.rangeOverrides,
        modifierForIndex: model.modifierForIndex,
      };
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

import type { ConfigBundle, GcodeResult, SliceManifest, SlicerModel } from '../types';

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
  return { blob, fileName, url: URL.createObjectURL(blob) };
}

import type { BufferGeometry } from 'three';

import { deserializeBufferGeometry, serializeBufferGeometry, type SerializedBufferGeometry } from './geometrySerialization';
import { cutGeometryByPlane, repairGeometry, splitDisconnectedShells } from './meshOperations';

export type MeshOperation =
  | { kind: 'repair' }
  | { kind: 'split-shells' }
  | { kind: 'plane-cut'; axis: 'x' | 'y' | 'z'; offset: number };

type Result = { geometries: BufferGeometry[]; report: Record<string, number> };
type WorkerResponse = { id: number; ok: true; geometries: SerializedBufferGeometry[]; report: Record<string, number> }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (result: Result) => void; reject: (error: Error) => void }>();

const direct = (geometry: BufferGeometry, operation: MeshOperation): Result => {
  if (operation.kind === 'repair') {
    const result = repairGeometry(geometry);
    return { geometries: [result.geometry], report: result.report };
  }
  if (operation.kind === 'split-shells') {
    const geometries = splitDisconnectedShells(geometry);
    return { geometries, report: { shellCount: geometries.length } };
  }
  const cut = cutGeometryByPlane(geometry, operation.axis, operation.offset);
  const geometries = [cut.negative, cut.positive].filter((value): value is BufferGeometry => value !== null);
  return { geometries, report: { partCount: geometries.length } };
};

const meshWorker = () => {
  if (worker) return worker;
  worker = new Worker(new URL('./meshOperations.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve({ geometries: response.geometries.map(deserializeBufferGeometry), report: response.report });
    else request.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    pending.forEach(({ reject }) => reject(new Error(event.message || 'Mesh operation worker failed')));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
};

export function runMeshOperation(geometry: BufferGeometry, operation: MeshOperation): Promise<Result> {
  if (typeof Worker === 'undefined') return Promise.resolve(direct(geometry, operation));
  try {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      meshWorker().postMessage({ id, geometry: serializeBufferGeometry(geometry), operation });
    });
  } catch {
    return Promise.resolve(direct(geometry, operation));
  }
}

import * as THREE from 'three';
import { deserializeBufferGeometry, SerializedBufferGeometry } from './geometrySerialization';
import { optimizeStlPreviewGeometry } from './stlPreviewOptimization';
import { parseStepGeometry } from './stepGeometry';

type ParseGeometryOptions = {
  optimizeForPreview?: boolean;
  onStatusChange?: (status: 'optimizing_preview' | 'preview_compressed') => void;
};

type WorkerResponse =
  | {
      id: number;
      ok: true;
      kind?: 'result';
      geometry: SerializedBufferGeometry;
    }
  | {
      id: number;
      ok: false;
      kind?: 'result';
      error: string;
    }
  | {
      id: number;
      ok: true;
      kind: 'status';
      status: 'optimizing_preview' | 'preview_compressed';
    };

type PendingParse = {
  resolve: (geometry: THREE.BufferGeometry) => void;
  reject: (error: Error) => void;
  onStatusChange?: (status: 'optimizing_preview' | 'preview_compressed') => void;
};

let geometryWorker: Worker | null = null;
let requestId = 0;
const pendingParses = new Map<number, PendingParse>();

const getFileExtension = (fileName: string) => fileName.toLowerCase().split('.').pop();

const parseGeometryOnMainThread = async (
  fileBuffer: ArrayBuffer,
  fileName: string,
  options?: ParseGeometryOptions,
): Promise<THREE.BufferGeometry> => {
  const fileExtension = getFileExtension(fileName);
  const optimizeForPreview = options?.optimizeForPreview ?? true;

  if (fileExtension === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
    const geometry = new STLLoader().parse(fileBuffer);
    return optimizeForPreview
      ? optimizeStlPreviewGeometry(geometry, options?.onStatusChange)
      : geometry;
  }

  if (fileExtension === '3mf') {
    const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
    const BufferGeometryUtils = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
    const group = new ThreeMFLoader().parse(fileBuffer);
    const geometries: THREE.BufferGeometry[] = [];

    group.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        geometries.push(child.geometry);
      }
    });

    if (geometries.length === 0) {
      throw new Error('No valid geometries found in 3MF file');
    }

    const geometry = geometries.length === 1
      ? geometries[0]
      : BufferGeometryUtils.mergeGeometries(geometries);

    geometry.computeVertexNormals();
    return geometry;
  }

  if (fileExtension === 'step' || fileExtension === 'stp') {
    return parseStepGeometry(fileBuffer);
  }

  throw new Error(`Unsupported file format: ${fileExtension}`);
};

const getGeometryWorker = () => {
  if (geometryWorker) return geometryWorker;

  geometryWorker = new Worker(new URL('./geometryParser.worker.ts', import.meta.url), { type: 'module' });
  geometryWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const pending = pendingParses.get(response.id);
    if (!pending) return;

    if (response.kind === 'status') {
      pending.onStatusChange?.(response.status);
      return;
    }

    pendingParses.delete(response.id);

    if (response.ok) {
      pending.resolve(deserializeBufferGeometry(response.geometry));
    } else {
      pending.reject(new Error(response.error));
    }
  };
  geometryWorker.onerror = (event) => {
    pendingParses.forEach(({ reject }) => reject(new Error(event.message || 'Geometry worker failed')));
    pendingParses.clear();
    geometryWorker?.terminate();
    geometryWorker = null;
  };

  return geometryWorker;
};

export const parseGeometry = (
  fileBuffer: ArrayBuffer,
  fileName: string,
  options?: ParseGeometryOptions,
): Promise<THREE.BufferGeometry> => {
  const fileExtension = getFileExtension(fileName);
  const optimizeForPreview = options?.optimizeForPreview ?? true;

  if (fileExtension === '3mf' || typeof Worker === 'undefined') {
    return parseGeometryOnMainThread(fileBuffer, fileName, options);
  }

  try {
    const worker = getGeometryWorker();
    const id = requestId += 1;

    return new Promise((resolve, reject) => {
      pendingParses.set(id, { resolve, reject, onStatusChange: options?.onStatusChange });
      worker.postMessage({ id, fileBuffer, fileName, optimizeForPreview }, [fileBuffer]);
    });
  } catch (error) {
    return parseGeometryOnMainThread(fileBuffer, fileName, options);
  }
};

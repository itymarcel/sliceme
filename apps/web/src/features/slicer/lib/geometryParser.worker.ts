import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getGeometryTransferables,
  serializeBufferGeometry,
  SerializedBufferGeometry,
} from './geometrySerialization';
import { optimizeStlPreviewGeometry } from './stlPreviewOptimization';
import { parseStepGeometry } from './stepGeometry';

type ParseGeometryRequest = {
  id: number;
  fileBuffer: ArrayBuffer;
  fileName: string;
  optimizeForPreview?: boolean;
};

type ParseGeometryResponse =
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

const workerContext = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ParseGeometryRequest>) => void) | null;
  postMessage: (message: ParseGeometryResponse, transfer?: Transferable[]) => void;
};

const getFileExtension = (fileName: string) => fileName.toLowerCase().split('.').pop();
const parseGeometry = async (
  fileBuffer: ArrayBuffer,
  fileName: string,
  optimizeForPreview = true,
): Promise<THREE.BufferGeometry> => {
  const fileExtension = getFileExtension(fileName);

  if (fileExtension === 'stl') {
    const geometry = new STLLoader().parse(fileBuffer);
    return optimizeForPreview ? optimizeStlPreviewGeometry(geometry) : geometry;
  }

  if (fileExtension === '3mf') {
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

workerContext.onmessage = async (event: MessageEvent<ParseGeometryRequest>) => {
  const { id, fileBuffer, fileName, optimizeForPreview = true } = event.data;

  try {
    const geometry = await (async () => {
      const fileExtension = getFileExtension(fileName);

      if (fileExtension === 'stl') {
        const geometry = new STLLoader().parse(fileBuffer);
        return optimizeForPreview
          ? optimizeStlPreviewGeometry(geometry, (status) => {
              const statusResponse: ParseGeometryResponse = { id, ok: true, kind: 'status', status };
              workerContext.postMessage(statusResponse);
            })
          : geometry;
      }

      return parseGeometry(fileBuffer, fileName, optimizeForPreview);
    })();
    const serialized = serializeBufferGeometry(geometry);
    const response: ParseGeometryResponse = { id, ok: true, kind: 'result', geometry: serialized };
    workerContext.postMessage(response, getGeometryTransferables(serialized));
  } catch (error) {
    const response: ParseGeometryResponse = {
      id,
      ok: false,
      kind: 'result',
      error: error instanceof Error ? error.message : 'Could not parse geometry',
    };
    workerContext.postMessage(response);
  }
};

export {};

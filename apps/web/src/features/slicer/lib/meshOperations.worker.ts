import { deserializeBufferGeometry, serializeBufferGeometry, type SerializedBufferGeometry } from './geometrySerialization';
import { cutGeometryByPlane, repairGeometry, splitDisconnectedShells } from './meshOperations';

type Request = {
  id: number;
  geometry: SerializedBufferGeometry;
  operation: { kind: 'repair' } | { kind: 'split-shells' } | { kind: 'plane-cut'; axis: 'x' | 'y' | 'z'; offset: number };
};

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, operation } = event.data;
  try {
    const geometry = deserializeBufferGeometry(event.data.geometry);
    if (operation.kind === 'repair') {
      const result = repairGeometry(geometry);
      self.postMessage({ id, ok: true, geometries: [serializeBufferGeometry(result.geometry)], report: result.report });
      return;
    }
    if (operation.kind === 'split-shells') {
      const geometries = splitDisconnectedShells(geometry);
      self.postMessage({ id, ok: true, geometries: geometries.map(serializeBufferGeometry), report: { shellCount: geometries.length } });
      return;
    }
    const result = cutGeometryByPlane(geometry, operation.axis, operation.offset);
    const geometries = [result.negative, result.positive].filter((value): value is NonNullable<typeof value> => value !== null);
    self.postMessage({ id, ok: true, geometries: geometries.map(serializeBufferGeometry), report: { partCount: geometries.length } });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Mesh operation failed' });
  }
};

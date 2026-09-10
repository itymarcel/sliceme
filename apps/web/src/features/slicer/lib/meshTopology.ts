import { BufferGeometry, Vector3 } from 'three';
export type Triangle = [Vector3, Vector3, Vector3];
export const EPSILON = 1e-6;
export const vertexKey = (point: Vector3) => `${Math.round(point.x / EPSILON)},${Math.round(point.y / EPSILON)},${Math.round(point.z / EPSILON)}`;
export const edgeKey = (a: Vector3, b: Vector3) => {
  const ka = vertexKey(a);
  const kb = vertexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export const trianglesFromGeometry = (geometry: BufferGeometry): Triangle[] => {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('Mesh has no position data.');
  const index = geometry.index;
  const count = index ? index.count : position.count;
  if (count % 3 !== 0) throw new Error('Mesh triangle data is incomplete.');
  const point = (offset: number) => {
    const vertexIndex = index ? index.getX(offset) : offset;
    return new Vector3(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
  };
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < count; offset += 3) triangles.push([point(offset), point(offset + 1), point(offset + 2)]);
  return triangles;
};


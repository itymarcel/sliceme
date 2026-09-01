import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

import type { BuildVolume, Position, Rotation, Scale } from '../types';

export type ModelBounds = { x: number; y: number; z: number };
export type SurfaceNormal = { x: number; y: number; z: number };
export type FlatSurfaceCandidate = { triangleIndices: number[]; normal: SurfaceNormal; area: number };

type Footprint = { width: number; depth: number; height: number };

const unitScale = (): Scale => ({ x: 1, y: 1, z: 1 });
const zeroRotation = (): Rotation => ({ x: 0, y: 0, z: 0 });

export function transformedFootprint(bounds: ModelBounds, scale = unitScale(), rotation = zeroRotation()): Footprint {
  const matrix = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(
    rotation.x * Math.PI / 180,
    rotation.y * Math.PI / 180,
    rotation.z * Math.PI / 180,
  )));
  const elements = matrix.elements;
  const sx = Math.abs(bounds.x * scale.x);
  const sy = Math.abs(bounds.y * scale.y);
  const sz = Math.abs(bounds.z * scale.z);
  return {
    width: Math.abs(elements[0]) * sx + Math.abs(elements[3]) * sy + Math.abs(elements[6]) * sz,
    depth: Math.abs(elements[1]) * sx + Math.abs(elements[4]) * sy + Math.abs(elements[7]) * sz,
    height: Math.abs(elements[2]) * sx + Math.abs(elements[5]) * sy + Math.abs(elements[8]) * sz,
  };
}

export function analyzePlacement(
  ids: string[],
  positions: Record<string, Position>,
  bounds: Record<string, ModelBounds>,
  scales: Record<string, Scale> = {},
  rotations: Record<string, Rotation> = {},
  bed: BuildVolume,
): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  const boxes = ids.flatMap((id) => {
    if (!bounds[id]) return [];
    const size = transformedFootprint(bounds[id], scales[id], rotations[id]);
    const position = positions[id] ?? { x: bed.x / 2, y: bed.y / 2 };
    const box = {
      id,
      minX: position.x - size.width / 2,
      maxX: position.x + size.width / 2,
      minY: position.y - size.depth / 2,
      maxY: position.y + size.depth / 2,
      minZ: position.z ?? 0,
      maxZ: (position.z ?? 0) + size.height,
      height: size.height,
    };
    if (box.minX < 0 || box.maxX > bed.x || box.minY < 0 || box.maxY > bed.y || box.minZ < 0 || box.maxZ > bed.z) {
      issues[id] = [...(issues[id] ?? []), 'outside'];
    }
    return [box];
  });
  boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other) => {
    if (box.minX < other.maxX && box.maxX > other.minX
      && box.minY < other.maxY && box.maxY > other.minY
      && box.minZ < other.maxZ && box.maxZ > other.minZ) {
      issues[box.id] = [...(issues[box.id] ?? []), 'overlap'];
      issues[other.id] = [...(issues[other.id] ?? []), 'overlap'];
    }
  }));
  return issues;
}

export function stackedDragPosition(
  movingId: string,
  x: number,
  y: number,
  ids: string[],
  positions: Record<string, Position>,
  bounds: Record<string, ModelBounds>,
  scales: Record<string, Scale> = {},
  rotations: Record<string, Rotation> = {},
): Position {
  const movingBounds = bounds[movingId];
  if (!movingBounds) return { x, y, z: 0 };
  const movingSize = transformedFootprint(movingBounds, scales[movingId], rotations[movingId]);
  const supportTop = ids.reduce((highest, id) => {
    if (id === movingId || !bounds[id]) return highest;
    const size = transformedFootprint(bounds[id], scales[id], rotations[id]);
    const position = positions[id];
    if (!position) return highest;
    const intersects = x - movingSize.width / 2 < position.x + size.width / 2
      && x + movingSize.width / 2 > position.x - size.width / 2
      && y - movingSize.depth / 2 < position.y + size.depth / 2
      && y + movingSize.depth / 2 > position.y - size.depth / 2;
    return intersects ? Math.max(highest, (position.z ?? 0) + size.height) : highest;
  }, 0);
  return { x, y, z: supportTop };
}

export function arrangeOnBed(
  ids: string[],
  bounds: Record<string, ModelBounds>,
  scales: Record<string, Scale> = {},
  rotations: Record<string, Rotation> = {},
  bed: BuildVolume,
  gap = 4,
): Record<string, Position> {
  const result: Record<string, Position> = {};
  let x = gap;
  let y = gap;
  let rowDepth = 0;
  ids.forEach((id) => {
    const size = transformedFootprint(bounds[id] ?? { x: 20, y: 20, z: 20 }, scales[id], rotations[id]);
    if (x + size.width + gap > bed.x && x > gap) {
      x = gap;
      y += rowDepth + gap;
      rowDepth = 0;
    }
    result[id] = {
      x: Math.min(bed.x - size.width / 2, x + size.width / 2),
      y: Math.min(bed.y - size.depth / 2, y + size.depth / 2),
    };
    x += size.width + gap;
    rowDepth = Math.max(rowDepth, size.depth);
  });
  return result;
}

export function duplicateDisplayName(name: string) {
  const match = name.match(/^(.*? copy)(?: (\d+))?$/);
  if (!match) return `${name} copy`;
  return `${match[1]} ${Number(match[2] ?? 1) + 1}`;
}

export function largestFaceDownRotation(positions: ArrayLike<number>, indices?: ArrayLike<number>, scale = unitScale()): Rotation {
  let bestNormal = new Vector3(0, 0, 1);
  let bestArea = -1;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  const readVertex = (target: Vector3, vertexIndex: number) => target.set(
    positions[vertexIndex * 3] * scale.x,
    positions[vertexIndex * 3 + 1] * scale.y,
    positions[vertexIndex * 3 + 2] * scale.z,
  );
  const vertexCount = indices?.length ?? positions.length / 3;
  for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
    readVertex(a, indices ? indices[offset] : offset);
    readVertex(b, indices ? indices[offset + 1] : offset + 1);
    readVertex(c, indices ? indices[offset + 2] : offset + 2);
    const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const area = normal.lengthSq();
    if (area > bestArea) {
      bestArea = area;
      bestNormal = normal.normalize().clone();
    }
  }
  const target = new Vector3(0, 0, -1);
  const euler = new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(bestNormal, target), 'XYZ');
  return { x: euler.x * 180 / Math.PI, y: euler.y * 180 / Math.PI, z: euler.z * 180 / Math.PI };
}

export function flatSurfaceCandidates(
  positions: ArrayLike<number>,
  indices?: ArrayLike<number>,
  scale = unitScale(),
  normalToleranceDegrees = 1,
): FlatSurfaceCandidate[] {
  type Triangle = {
    faceIndex: number;
    normal: Vector3;
    area: number;
    plane: number;
    edges: string[];
  };
  const vertex = (index: number) => new Vector3(
    positions[index * 3] * scale.x,
    positions[index * 3 + 1] * scale.y,
    positions[index * 3 + 2] * scale.z,
  );
  const key = (point: Vector3) => `${Math.round(point.x * 100000)},${Math.round(point.y * 100000)},${Math.round(point.z * 100000)}`;
  const edgeKey = (a: Vector3, b: Vector3) => [key(a), key(b)].sort().join('|');
  const elementCount = indices?.length ?? positions.length / 3;
  const orientationSign = Math.sign(scale.x * scale.y * scale.z) || 1;
  const triangles: Triangle[] = [];
  for (let offset = 0; offset + 2 < elementCount; offset += 3) {
    const a = vertex(indices ? indices[offset] : offset);
    const b = vertex(indices ? indices[offset + 1] : offset + 1);
    const c = vertex(indices ? indices[offset + 2] : offset + 2);
    const cross = b.clone().sub(a).cross(c.clone().sub(a));
    const area = cross.length() / 2;
    if (area <= Number.EPSILON) continue;
    const normal = cross.normalize().multiplyScalar(orientationSign);
    triangles.push({
      faceIndex: offset / 3,
      normal,
      area,
      plane: normal.dot(a),
      edges: [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)],
    });
  }
  const edgeOwners = new Map<string, number[]>();
  triangles.forEach((triangle, index) => triangle.edges.forEach((edge) => edgeOwners.set(edge, [...(edgeOwners.get(edge) ?? []), index])));
  const cosineTolerance = Math.cos(normalToleranceDegrees * Math.PI / 180);
  const visited = new Set<number>();
  const surfaces: FlatSurfaceCandidate[] = [];
  triangles.forEach((seed, seedIndex) => {
    if (visited.has(seedIndex)) return;
    const queue = [seedIndex];
    const triangleIndices: number[] = [];
    let area = 0;
    visited.add(seedIndex);
    while (queue.length) {
      const currentIndex = queue.pop()!;
      const current = triangles[currentIndex];
      triangleIndices.push(current.faceIndex);
      area += current.area;
      current.edges.flatMap((edge) => edgeOwners.get(edge) ?? []).forEach((neighborIndex) => {
        if (visited.has(neighborIndex)) return;
        const neighbor = triangles[neighborIndex];
        if (seed.normal.dot(neighbor.normal) < cosineTolerance || Math.abs(seed.plane - neighbor.plane) > 0.0001) return;
        visited.add(neighborIndex);
        queue.push(neighborIndex);
      });
    }
    surfaces.push({
      triangleIndices: triangleIndices.sort((a, b) => a - b),
      normal: { x: seed.normal.x, y: seed.normal.y, z: seed.normal.z },
      area,
    });
  });
  return surfaces.sort((a, b) => b.area - a.area || a.triangleIndices[0] - b.triangleIndices[0]);
}

export function surfaceDownRotation(normal: SurfaceNormal, currentRotation = zeroRotation()): Rotation {
  const currentEuler = new Euler(
    currentRotation.x * Math.PI / 180,
    currentRotation.y * Math.PI / 180,
    currentRotation.z * Math.PI / 180,
    'XYZ',
  );
  const currentQuaternion = new Quaternion().setFromEuler(currentEuler);
  const worldNormal = new Vector3(normal.x, normal.y, normal.z).normalize().applyQuaternion(currentQuaternion);
  const delta = new Quaternion().setFromUnitVectors(worldNormal, new Vector3(0, 0, -1));
  const result = new Euler().setFromQuaternion(delta.multiply(currentQuaternion), 'XYZ');
  return { x: result.x * 180 / Math.PI, y: result.y * 180 / Math.PI, z: result.z * 180 / Math.PI };
}

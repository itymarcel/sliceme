import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, ExtrudeGeometry, Matrix4, Path, Shape, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  centerSourceGeometry,
  cutGeometryByPlane,
  finalizeGeneratedGeometry,
  geometryToBinaryStl,
  repairGeometry,
  splitDisconnectedShells,
} from './meshOperations';

const bounds = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
};

const boundaryEdgeCount = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute('position');
  const key = (index: number) => `${position.getX(index).toFixed(5)},${position.getY(index).toFixed(5)},${position.getZ(index).toFixed(5)}`;
  const counts = new Map<string, number>();
  for (let index = 0; index < position.count; index += 3) {
    const vertices = [key(index), key(index + 1), key(index + 2)];
    for (const [a, b] of [[vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]]]) {
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((count) => count === 1).length;
};

const orientationConflictCount = (geometry: BufferGeometry) => {
  const position = geometry.getAttribute('position');
  const key = (index: number) => `${position.getX(index).toFixed(5)},${position.getY(index).toFixed(5)},${position.getZ(index).toFixed(5)}`;
  const directions = new Map<string, number>();
  for (let index = 0; index < position.count; index += 3) {
    const vertices = [key(index), key(index + 1), key(index + 2)];
    for (const [a, b] of [[vertices[0], vertices[1]], [vertices[1], vertices[2]], [vertices[2], vertices[0]]]) {
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      directions.set(edge, (directions.get(edge) ?? 0) + (a < b ? 1 : -1));
    }
  }
  return [...directions.values()].filter((direction) => direction !== 0).length;
};

describe('mesh operations', () => {
  it('splits disconnected shells into independent geometries', () => {
    const left = new BoxGeometry(2, 2, 2).toNonIndexed();
    const right = new BoxGeometry(2, 2, 2).toNonIndexed().applyMatrix4(new Matrix4().makeTranslation(5, 0, 0));
    const merged = mergeGeometries([left, right], false)!;

    const shells = splitDisconnectedShells(merged);

    expect(shells).toHaveLength(2);
    expect(shells.map((shell) => bounds(shell).getSize(new Vector3()).x)).toEqual([2, 2]);
    expect(shells.map((shell) => bounds(shell).getCenter(new Vector3()).x).sort((a, b) => a - b)).toEqual([0, 5]);
  });

  it('repairs duplicate and degenerate triangles and emits normals', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 1, 0, 0,
    ]), 3));

    const repaired = repairGeometry(geometry);

    expect(repaired.report.removedDegenerateTriangles).toBe(1);
    expect(repaired.report.removedDuplicateTriangles).toBe(1);
    expect(repaired.geometry.getAttribute('position').count).toBe(3);
    expect(repaired.geometry.getAttribute('normal').count).toBe(3);
  });

  it('repairs inconsistent triangle winding on closed shells', () => {
    const source = new BoxGeometry(4, 4, 4).toNonIndexed();
    const positions = new Float32Array(source.getAttribute('position').array);
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      [positions[3 + coordinate], positions[6 + coordinate]] = [positions[6 + coordinate], positions[3 + coordinate]];
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    expect(orientationConflictCount(geometry)).toBeGreaterThan(0);

    const repaired = repairGeometry(geometry);

    expect(orientationConflictCount(repaired.geometry)).toBe(0);
  });

  it('fills a simple planar boundary during repair', () => {
    const openBox = new BoxGeometry(4, 4, 4).toNonIndexed();
    const positions = openBox.getAttribute('position').array.slice(0, 30 * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions as Float32Array, 3));

    const repaired = repairGeometry(geometry);

    expect(boundaryEdgeCount(repaired.geometry)).toBe(0);
    expect(repaired.report.filledHoles).toBe(1);
  });

  it('cuts a closed mesh into two capped closed meshes', () => {
    const box = new BoxGeometry(10, 8, 6).toNonIndexed();

    const result = cutGeometryByPlane(box, 'z', 0);

    expect(result.negative).not.toBeNull();
    expect(result.positive).not.toBeNull();
    const lower = bounds(result.negative!);
    const upper = bounds(result.positive!);
    expect(lower.min.z).toBeCloseTo(-3);
    expect(lower.max.z).toBeCloseTo(0);
    expect(upper.min.z).toBeCloseTo(0);
    expect(upper.max.z).toBeCloseTo(3);
    expect(boundaryEdgeCount(result.negative!)).toBe(0);
    expect(boundaryEdgeCount(result.positive!)).toBe(0);
  });

  it('bakes scale and rotation while preserving generated world placement', () => {
    const source = centerSourceGeometry(new BoxGeometry(2, 4, 6).toNonIndexed().translate(50, -20, 7));
    const finalized = finalizeGeneratedGeometry(source, {
      position: { x: 10, y: 20, z: 3 },
      rotation: { x: 0, y: 0, z: 90 },
      scale: { x: 2, y: 1, z: 1 },
    });
    const box = bounds(finalized.geometry);

    expect(finalized.position).toEqual({ x: 10, y: 20, z: 3 });
    expect(box.getSize(new Vector3()).toArray()).toEqual([4, 4, 6]);
    expect(box.getCenter(new Vector3()).x).toBeCloseTo(0);
    expect(box.getCenter(new Vector3()).y).toBeCloseTo(0);
    expect(box.min.z).toBeCloseTo(0);
  });

  it('preserves world placement for models tilted around X and Y', () => {
    const source = centerSourceGeometry(new BoxGeometry(2, 4, 6).toNonIndexed().translate(50, -20, 7));
    const finalized = finalizeGeneratedGeometry(source, {
      position: { x: 10, y: 20, z: 3 },
      rotation: { x: 35, y: 20, z: 15 },
      scale: { x: 2, y: 1, z: 0.75 },
    });

    expect(finalized.position.x).toBeCloseTo(10);
    expect(finalized.position.y).toBeCloseTo(20);
    expect(finalized.position.z).toBeCloseTo(3);
  });

  it('caps hollow cross-sections without filling their holes', () => {
    const shape = new Shape();
    shape.moveTo(-5, -5); shape.lineTo(5, -5); shape.lineTo(5, 5); shape.lineTo(-5, 5); shape.closePath();
    const hole = new Path();
    hole.moveTo(-2, -2); hole.lineTo(-2, 2); hole.lineTo(2, 2); hole.lineTo(2, -2); hole.closePath();
    shape.holes.push(hole);
    const tube = new ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false }).translate(0, 0, -3);

    const result = cutGeometryByPlane(tube, 'z', 0);
    const capArea = (geometry: BufferGeometry) => {
      const position = geometry.getAttribute('position');
      let area = 0;
      for (let index = 0; index < position.count; index += 3) {
        const a = new Vector3().fromBufferAttribute(position, index);
        const b = new Vector3().fromBufferAttribute(position, index + 1);
        const c = new Vector3().fromBufferAttribute(position, index + 2);
        if ([a.z, b.z, c.z].every((z) => Math.abs(z) < 1e-5)) {
          area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        }
      }
      return area;
    };

    expect(result.negative).not.toBeNull();
    expect(result.positive).not.toBeNull();
    expect(capArea(result.negative!)).toBeCloseTo(84, 4);
    expect(capArea(result.positive!)).toBeCloseTo(84, 4);
    expect(boundaryEdgeCount(result.negative!)).toBe(0);
    expect(boundaryEdgeCount(result.positive!)).toBe(0);
  });

  it('serializes edited geometry as a valid binary STL', () => {
    const data = geometryToBinaryStl(new BoxGeometry(2, 2, 2).toNonIndexed());
    const view = new DataView(data);

    expect(view.byteLength).toBe(84 + 12 * 50);
    expect(view.getUint32(80, true)).toBe(12);
  });
});

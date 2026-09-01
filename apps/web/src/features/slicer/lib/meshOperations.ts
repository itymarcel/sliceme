import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Matrix4,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three';

type Axis = 'x' | 'y' | 'z';
type Triangle = [Vector3, Vector3, Vector3];
type RepairReport = {
  inputTriangles: number;
  outputTriangles: number;
  removedDegenerateTriangles: number;
  removedDuplicateTriangles: number;
  filledHoles: number;
  flippedTriangles: number;
};

const EPSILON = 1e-6;
const vertexKey = (point: Vector3) => `${Math.round(point.x / EPSILON)},${Math.round(point.y / EPSILON)},${Math.round(point.z / EPSILON)}`;
const edgeKey = (a: Vector3, b: Vector3) => {
  const ka = vertexKey(a);
  const kb = vertexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

const trianglesFromGeometry = (geometry: BufferGeometry): Triangle[] => {
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

const geometryFromTriangles = (triangles: Triangle[]) => {
  const positions = new Float32Array(triangles.length * 9);
  let offset = 0;
  triangles.forEach((triangle) => triangle.forEach((point) => {
    positions[offset++] = point.x;
    positions[offset++] = point.y;
    positions[offset++] = point.z;
  }));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const triangleAreaSquared = ([a, b, c]: Triangle) => new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).lengthSq();

const fillBoundaryHoles = (triangles: Triangle[]) => {
  if (triangles.length < 4) return { triangles, filledHoles: 0 };
  const edgeCounts = new Map<string, { count: number; a: Vector3; b: Vector3 }>();
  triangles.forEach((triangle) => {
    for (let index = 0; index < 3; index += 1) {
      const a = triangle[index];
      const b = triangle[(index + 1) % 3];
      const key = edgeKey(a, b);
      const prior = edgeCounts.get(key);
      edgeCounts.set(key, prior ? { ...prior, count: prior.count + 1 } : { count: 1, a, b });
    }
  });
  const boundary = [...edgeCounts.values()].filter((edge) => edge.count === 1);
  const points = new Map<string, Vector3>();
  const adjacency = new Map<string, Set<string>>();
  boundary.forEach(({ a, b }) => {
    const ka = vertexKey(a);
    const kb = vertexKey(b);
    points.set(ka, a);
    points.set(kb, b);
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka)!.add(kb);
    adjacency.get(kb)!.add(ka);
  });
  const unused = new Set(boundary.map(({ a, b }) => edgeKey(a, b)));
  const added: Triangle[] = [];
  let filledHoles = 0;
  while (unused.size) {
    const first = unused.values().next().value as string;
    const [start, next] = first.split('|');
    const keys = [start];
    let previous = start;
    let current = next;
    unused.delete(first);
    while (current !== start && keys.length <= points.size + 1) {
      keys.push(current);
      const following = [...(adjacency.get(current) ?? [])].find((candidate) => candidate !== previous && unused.has(current < candidate ? `${current}|${candidate}` : `${candidate}|${current}`));
      if (!following) break;
      unused.delete(current < following ? `${current}|${following}` : `${following}|${current}`);
      previous = current;
      current = following;
    }
    if (current !== start || keys.length < 3) continue;
    const loop = keys.map((key) => points.get(key)!).reverse();
    const normal = new Vector3();
    loop.forEach((point, index) => {
      const nextPoint = loop[(index + 1) % loop.length];
      normal.x += (point.y - nextPoint.y) * (point.z + nextPoint.z);
      normal.y += (point.z - nextPoint.z) * (point.x + nextPoint.x);
      normal.z += (point.x - nextPoint.x) * (point.y + nextPoint.y);
    });
    if (normal.lengthSq() <= EPSILON * EPSILON) continue;
    const planeNormal = normal.clone().normalize();
    const planeOrigin = loop[0];
    if (loop.some((point) => Math.abs(planeNormal.dot(point.clone().sub(planeOrigin))) > EPSILON * 100)) continue;
    const dominant: Axis = Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)
      ? 'x'
      : Math.abs(normal.y) >= Math.abs(normal.z) ? 'y' : 'z';
    const projected = loop.map((point) => planeProjection(point, dominant));
    ShapeUtils.triangulateShape(projected, []).forEach(([ia, ib, ic]) => {
      const triangle: Triangle = [loop[ia].clone(), loop[ib].clone(), loop[ic].clone()];
      if (triangleAreaSquared(triangle) > EPSILON * EPSILON) added.push(triangle);
    });
    filledHoles += 1;
  }
  return { triangles: [...triangles, ...added], filledHoles };
};

const orientTrianglesConsistently = (triangles: Triangle[]) => {
  const owners = new Map<string, Array<{ triangle: number; direction: number }>>();
  triangles.forEach((triangle, triangleIndex) => {
    for (let index = 0; index < 3; index += 1) {
      const a = vertexKey(triangle[index]);
      const b = vertexKey(triangle[(index + 1) % 3]);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      owners.set(key, [...(owners.get(key) ?? []), { triangle: triangleIndex, direction: a < b ? 1 : -1 }]);
    }
  });
  const flips = new Map<number, boolean>();
  triangles.forEach((_, seed) => {
    if (flips.has(seed)) return;
    flips.set(seed, false);
    const queue = [seed];
    while (queue.length) {
      const triangleIndex = queue.pop()!;
      const triangle = triangles[triangleIndex];
      for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
        const a = vertexKey(triangle[edgeIndex]);
        const b = vertexKey(triangle[(edgeIndex + 1) % 3]);
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const currentDirection = (a < b ? 1 : -1) * (flips.get(triangleIndex) ? -1 : 1);
        (owners.get(key) ?? []).forEach((owner) => {
          if (owner.triangle === triangleIndex || flips.has(owner.triangle)) return;
          flips.set(owner.triangle, owner.direction === currentDirection);
          queue.push(owner.triangle);
        });
      }
    }
  });
  let flippedTriangles = 0;
  const oriented = triangles.map((triangle, index): Triangle => {
    if (!flips.get(index)) return triangle;
    flippedTriangles += 1;
    return [triangle[0], triangle[2], triangle[1]];
  });
  return { triangles: oriented, flippedTriangles };
};

export function repairGeometry(geometry: BufferGeometry): { geometry: BufferGeometry; report: RepairReport } {
  const input = trianglesFromGeometry(geometry);
  const unique = new Map<string, Triangle>();
  let removedDegenerateTriangles = 0;
  let removedDuplicateTriangles = 0;
  input.forEach((triangle) => {
    if (triangleAreaSquared(triangle) <= EPSILON * EPSILON) {
      removedDegenerateTriangles += 1;
      return;
    }
    const key = triangle.map(vertexKey).sort().join('|');
    if (unique.has(key)) {
      removedDuplicateTriangles += 1;
      return;
    }
    unique.set(key, triangle.map((point) => point.clone()) as Triangle);
  });
  const cleaned = [...unique.values()];
  const filled = fillBoundaryHoles(cleaned);
  const oriented = orientTrianglesConsistently(filled.triangles);
  const triangles = oriented.triangles;
  return {
    geometry: geometryFromTriangles(triangles),
    report: {
      inputTriangles: input.length,
      outputTriangles: triangles.length,
      removedDegenerateTriangles,
      removedDuplicateTriangles,
      filledHoles: filled.filledHoles,
      flippedTriangles: oriented.flippedTriangles,
    },
  };
}

export function splitDisconnectedShells(geometry: BufferGeometry): BufferGeometry[] {
  const triangles = trianglesFromGeometry(geometry);
  if (!triangles.length) return [];
  const vertexTriangles = new Map<string, number[]>();
  triangles.forEach((triangle, triangleIndex) => triangle.forEach((point) => {
    const key = vertexKey(point);
    const connected = vertexTriangles.get(key) ?? [];
    connected.push(triangleIndex);
    vertexTriangles.set(key, connected);
  }));
  const remaining = new Set(triangles.map((_, index) => index));
  const shells: BufferGeometry[] = [];
  while (remaining.size) {
    const seed = remaining.values().next().value as number;
    const queue = [seed];
    const component: Triangle[] = [];
    remaining.delete(seed);
    while (queue.length) {
      const index = queue.pop()!;
      const triangle = triangles[index];
      component.push(triangle);
      triangle.forEach((point) => (vertexTriangles.get(vertexKey(point)) ?? []).forEach((neighbor) => {
        if (!remaining.delete(neighbor)) return;
        queue.push(neighbor);
      }));
    }
    shells.push(geometryFromTriangles(component));
  }
  return shells.sort((a, b) => {
    a.computeBoundingBox();
    b.computeBoundingBox();
    const ac = a.boundingBox!.getCenter(new Vector3());
    const bc = b.boundingBox!.getCenter(new Vector3());
    return ac.x - bc.x || ac.y - bc.y || ac.z - bc.z;
  });
}

const coordinate = (point: Vector3, axis: Axis) => point[axis];
const interpolateAtPlane = (a: Vector3, b: Vector3, axis: Axis, offset: number) => {
  const denominator = coordinate(b, axis) - coordinate(a, axis);
  if (Math.abs(denominator) <= EPSILON) return a.clone();
  return a.clone().lerp(b, (offset - coordinate(a, axis)) / denominator);
};

const clipPolygon = (polygon: Vector3[], axis: Axis, offset: number, keepPositive: boolean) => {
  const inside = (point: Vector3) => keepPositive
    ? coordinate(point, axis) >= offset - EPSILON
    : coordinate(point, axis) <= offset + EPSILON;
  const result: Vector3[] = [];
  polygon.forEach((current, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) result.push(interpolateAtPlane(previous, current, axis, offset));
    if (currentInside) result.push(current.clone());
  });
  return result;
};

const triangulatePolygon = (polygon: Vector3[], output: Triangle[]) => {
  for (let index = 1; index + 1 < polygon.length; index += 1) {
    const triangle: Triangle = [polygon[0].clone(), polygon[index].clone(), polygon[index + 1].clone()];
    if (triangleAreaSquared(triangle) > EPSILON * EPSILON) output.push(triangle);
  }
};

const planeProjection = (point: Vector3, axis: Axis) => axis === 'x'
  ? new Vector2(point.y, point.z)
  : axis === 'y'
    ? new Vector2(point.x, point.z)
    : new Vector2(point.x, point.y);

const pointInPolygon = (point: Vector2, polygon: Vector2[]) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const capLoops = (segments: Array<[Vector3, Vector3]>, axis: Axis, desiredNormal: number): Triangle[] => {
  const points = new Map<string, Vector3>();
  const adjacency = new Map<string, Set<string>>();
  segments.forEach(([a, b]) => {
    const ka = vertexKey(a);
    const kb = vertexKey(b);
    if (ka === kb) return;
    points.set(ka, a.clone());
    points.set(kb, b.clone());
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka)!.add(kb);
    adjacency.get(kb)!.add(ka);
  });
  const unused = new Set<string>();
  adjacency.forEach((neighbors, key) => neighbors.forEach((neighbor) => unused.add(key < neighbor ? `${key}|${neighbor}` : `${neighbor}|${key}`)));
  const loops: Array<{ points: Vector3[]; projected: Vector2[] }> = [];
  while (unused.size) {
    const firstEdge = unused.values().next().value as string;
    const [start, next] = firstEdge.split('|');
    const loopKeys = [start];
    let previous = start;
    let current = next;
    unused.delete(firstEdge);
    while (current !== start && loopKeys.length <= points.size + 1) {
      loopKeys.push(current);
      const candidates = [...(adjacency.get(current) ?? [])].filter((candidate) => candidate !== previous);
      const following = candidates.find((candidate) => unused.has(current < candidate ? `${current}|${candidate}` : `${candidate}|${current}`));
      if (!following) break;
      unused.delete(current < following ? `${current}|${following}` : `${following}|${current}`);
      previous = current;
      current = following;
    }
    if (current !== start || loopKeys.length < 3) continue;
    const loopPoints = loopKeys.map((key) => points.get(key)!);
    loops.push({ points: loopPoints, projected: loopPoints.map((point) => planeProjection(point, axis)) });
  }

  const depths = loops.map((loop, index) => loops.reduce((depth, candidate, candidateIndex) => (
    candidateIndex !== index && pointInPolygon(loop.projected[0], candidate.projected) ? depth + 1 : depth
  ), 0));
  const caps: Triangle[] = [];
  loops.forEach((outer, outerIndex) => {
    if (depths[outerIndex] % 2 !== 0) return;
    const holes = loops.filter((hole, holeIndex) => depths[holeIndex] === depths[outerIndex] + 1
      && pointInPolygon(hole.projected[0], outer.projected));
    const allPoints = [outer.points, ...holes.map((hole) => hole.points)].flat();
    ShapeUtils.triangulateShape(outer.projected, holes.map((hole) => hole.projected)).forEach(([ia, ib, ic]) => {
      let triangle: Triangle = [allPoints[ia].clone(), allPoints[ib].clone(), allPoints[ic].clone()];
      const normal = new Vector3().subVectors(triangle[1], triangle[0]).cross(new Vector3().subVectors(triangle[2], triangle[0]));
      if (coordinate(normal, axis) * desiredNormal < 0) triangle = [triangle[0], triangle[2], triangle[1]];
      if (triangleAreaSquared(triangle) > EPSILON * EPSILON) caps.push(triangle);
    });
  });
  return caps;
};

export function cutGeometryByPlane(geometry: BufferGeometry, axis: Axis, offset: number): {
  negative: BufferGeometry | null;
  positive: BufferGeometry | null;
} {
  const negative: Triangle[] = [];
  const positive: Triangle[] = [];
  const segments: Array<[Vector3, Vector3]> = [];
  trianglesFromGeometry(geometry).forEach((triangle) => {
    const distances = triangle.map((point) => coordinate(point, axis) - offset);
    if (distances.some((value) => value < -EPSILON) && distances.some((value) => value > EPSILON)) {
      const intersections: Vector3[] = [];
      for (let index = 0; index < 3; index += 1) {
        const a = triangle[index];
        const b = triangle[(index + 1) % 3];
        const da = distances[index];
        const db = distances[(index + 1) % 3];
        if ((da < -EPSILON && db > EPSILON) || (da > EPSILON && db < -EPSILON)) intersections.push(interpolateAtPlane(a, b, axis, offset));
        else if (Math.abs(da) <= EPSILON) intersections.push(a.clone());
      }
      const distinct = [...new Map(intersections.map((point) => [vertexKey(point), point])).values()];
      if (distinct.length >= 2) segments.push([distinct[0], distinct[1]]);
    }
    triangulatePolygon(clipPolygon(triangle, axis, offset, false), negative);
    triangulatePolygon(clipPolygon(triangle, axis, offset, true), positive);
  });
  negative.push(...capLoops(segments, axis, 1));
  positive.push(...capLoops(segments, axis, -1));
  return {
    negative: negative.length ? geometryFromTriangles(negative) : null,
    positive: positive.length ? geometryFromTriangles(positive) : null,
  };
}

export function geometryToBinaryStl(geometry: BufferGeometry): ArrayBuffer {
  const triangles = trianglesFromGeometry(geometry);
  const output = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(output);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, triangleIndex) => {
    const normal = new Vector3().subVectors(triangle[1], triangle[0]).cross(new Vector3().subVectors(triangle[2], triangle[0])).normalize();
    let offset = 84 + triangleIndex * 50;
    [normal, ...triangle].forEach((point) => {
      view.setFloat32(offset, point.x, true);
      view.setFloat32(offset + 4, point.y, true);
      view.setFloat32(offset + 8, point.z, true);
      offset += 12;
    });
    view.setUint16(offset, 0, true);
  });
  return output;
}

export function geometryToStlFile(geometry: BufferGeometry, fileName: string): File {
  return new File([geometryToBinaryStl(geometry)], fileName.replace(/\.[^.]+$/, '') + '.stl', { type: 'model/stl' });
}

export type GeometryTransform = {
  position: { x: number; y: number; z?: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
};

export function centerSourceGeometry(geometry: BufferGeometry): BufferGeometry {
  const centered = geometry.clone();
  centered.computeBoundingBox();
  if (!centered.boundingBox) throw new Error('Mesh has no measurable bounds.');
  const center = centered.boundingBox.getCenter(new Vector3());
  centered.translate(-center.x, -center.y, -center.z);
  centered.computeBoundingBox();
  return centered;
}

export function finalizeGeneratedGeometry(geometry: BufferGeometry, transform: GeometryTransform, groundingGeometry: BufferGeometry = geometry): {
  geometry: BufferGeometry;
  position: { x: number; y: number; z: number };
} {
  const world = geometry.clone();
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const quaternion = new Quaternion().setFromEuler(new Euler(radians(transform.rotation.x), radians(transform.rotation.y), radians(transform.rotation.z), 'XYZ'));
  const scale = new Vector3(transform.scale.x, transform.scale.y, transform.scale.z);
  groundingGeometry.computeBoundingBox();
  if (!groundingGeometry.boundingBox) throw new Error('Source mesh has no measurable bounds.');
  const rotationScale = new Matrix4().compose(new Vector3(), quaternion, scale);
  const sourceBounds = groundingGeometry.boundingBox.clone().applyMatrix4(rotationScale);
  const matrix = new Matrix4().compose(
    new Vector3(transform.position.x, transform.position.y, (transform.position.z ?? 0) - sourceBounds.min.z),
    quaternion,
    scale,
  );
  world.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    const positions = world.getAttribute('position');
    for (let index = 0; index < positions.count; index += 3) {
      const bx = positions.getX(index + 1); const by = positions.getY(index + 1); const bz = positions.getZ(index + 1);
      positions.setXYZ(index + 1, positions.getX(index + 2), positions.getY(index + 2), positions.getZ(index + 2));
      positions.setXYZ(index + 2, bx, by, bz);
    }
    positions.needsUpdate = true;
  }
  world.computeBoundingBox();
  if (!world.boundingBox) throw new Error('Generated mesh has no measurable bounds.');
  const center = world.boundingBox.getCenter(new Vector3());
  const minZ = world.boundingBox.min.z;
  world.translate(-center.x, -center.y, -minZ);
  world.computeVertexNormals();
  world.computeBoundingBox();
  world.computeBoundingSphere();
  return { geometry: world, position: { x: center.x, y: center.y, z: minZ } };
}

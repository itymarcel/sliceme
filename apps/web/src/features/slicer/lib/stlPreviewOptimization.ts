import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { EdgeSplitModifier } from 'three/examples/jsm/modifiers/EdgeSplitModifier.js';

const PREVIEW_TRIANGLE_THRESHOLD = 700_000;
const PREVIEW_MIN_TRIANGLES = 40_000;
const PREVIEW_MAX_TRIANGLES = 700_000;
const PREVIEW_TARGET_RATIO = 0.2;
const PREVIEW_TARGET_ERROR = 0.008;
const MISSING_VERTEX = 0xffffffff;
const CREASE_ANGLE = Math.PI * 0.15;
const ATTRIBUTE_WEIGHTS = [0.6, 0.6, 0.6];
const SIMPLIFY_FLAGS: Array<'Prune' | 'Permissive' | 'Regularize'> = [
  'Prune',
  'Permissive',
];

const toUint32IndexArray = (
  indexArray: Uint16Array | Uint32Array | Int16Array | Int32Array,
) => (indexArray instanceof Uint32Array ? indexArray : new Uint32Array(indexArray));

const compactAttribute = (
  sourceArray: Float32Array,
  itemSize: number,
  remap: Uint32Array,
  uniqueVertexCount: number,
) => {
  const compactedArray = new Float32Array(uniqueVertexCount * itemSize);

  for (let sourceVertex = 0; sourceVertex < remap.length; sourceVertex += 1) {
    const targetVertex = remap[sourceVertex];

    if (targetVertex === MISSING_VERTEX || targetVertex >= uniqueVertexCount) {
      continue;
    }

    const sourceOffset = sourceVertex * itemSize;
    const targetOffset = targetVertex * itemSize;

    for (let component = 0; component < itemSize; component += 1) {
      compactedArray[targetOffset + component] = sourceArray[sourceOffset + component];
    }
  }

  return compactedArray;
};

const getTargetTriangleCount = (triangleCount: number) => {
  const ratioTarget = Math.floor(triangleCount * PREVIEW_TARGET_RATIO);
  return Math.min(PREVIEW_MAX_TRIANGLES, Math.max(PREVIEW_MIN_TRIANGLES, ratioTarget));
};

const buildPositionIndexedGeometry = (
  positionArray: Float32Array,
  normalArray: Float32Array | null,
) => {
  const remap = MeshoptSimplifier.generatePositionRemap(positionArray, 3);
  let uniqueVertexCount = 0;

  for (let index = 0; index < remap.length; index += 1) {
    uniqueVertexCount = Math.max(uniqueVertexCount, remap[index] + 1);
  }

  const positions = new Float32Array(uniqueVertexCount * 3);
  const normals = normalArray ? new Float32Array(uniqueVertexCount * 3) : null;
  const normalCounts = normalArray ? new Uint32Array(uniqueVertexCount) : null;
  const seenVertices = new Uint8Array(uniqueVertexCount);
  const indexArray = uniqueVertexCount > 65535
    ? new Uint32Array(remap.length)
    : new Uint16Array(remap.length);

  for (let sourceVertex = 0; sourceVertex < remap.length; sourceVertex += 1) {
    const targetVertex = remap[sourceVertex];
    const sourceOffset = sourceVertex * 3;
    const targetOffset = targetVertex * 3;

    indexArray[sourceVertex] = targetVertex;

    if (seenVertices[targetVertex] === 0) {
      positions[targetOffset] = positionArray[sourceOffset];
      positions[targetOffset + 1] = positionArray[sourceOffset + 1];
      positions[targetOffset + 2] = positionArray[sourceOffset + 2];
      seenVertices[targetVertex] = 1;
    }

    if (normals && normalArray && normalCounts) {
      normals[targetOffset] += normalArray[sourceOffset];
      normals[targetOffset + 1] += normalArray[sourceOffset + 1];
      normals[targetOffset + 2] += normalArray[sourceOffset + 2];
      normalCounts[targetVertex] += 1;
    }
  }

  if (normals && normalCounts) {
    for (let vertex = 0; vertex < uniqueVertexCount; vertex += 1) {
      const targetOffset = vertex * 3;
      const count = normalCounts[vertex];

      if (count === 0) {
        continue;
      }

      const x = normals[targetOffset] / count;
      const y = normals[targetOffset + 1] / count;
      const z = normals[targetOffset + 2] / count;
      const length = Math.hypot(x, y, z) || 1;

      normals[targetOffset] = x / length;
      normals[targetOffset + 1] = y / length;
      normals[targetOffset + 2] = z / length;
    }
  }

  return { positions, normals, indexArray, uniqueVertexCount };
};

export const optimizeStlPreviewGeometry = async (
  geometry: THREE.BufferGeometry,
  onStatusChange?: (status: 'optimizing_preview' | 'preview_compressed') => void,
): Promise<THREE.BufferGeometry> => {
  const positionAttribute = geometry.getAttribute('position');
  const triangleCount = Math.floor(
    ((geometry.index?.count ?? positionAttribute?.count ?? 0)) / 3,
  );

  if (!positionAttribute || triangleCount <= PREVIEW_TRIANGLE_THRESHOLD) {
    return geometry;
  }

  try {
    const startedAt = performance.now();
    onStatusChange?.('optimizing_preview');

    const workingGeometry = geometry.clone();
    if (!workingGeometry.getAttribute('normal')) {
      workingGeometry.computeVertexNormals();
    }

    const indexedStartedAt = performance.now();
    const indexedPositionAttribute = workingGeometry.getAttribute('position');
    const indexedNormalAttribute = workingGeometry.getAttribute('normal');
    const indexedPositionArray = indexedPositionAttribute?.array;
    const indexedNormalArray = indexedNormalAttribute?.array;

    if (
      !indexedPositionAttribute ||
      !(indexedPositionArray instanceof Float32Array) ||
      (indexedNormalArray != null && !(indexedNormalArray instanceof Float32Array))
    ) {
      return geometry;
    }

    const indexedGeometry = buildPositionIndexedGeometry(
      indexedPositionArray,
      indexedNormalArray instanceof Float32Array ? indexedNormalArray : null,
    );
    const indexedFinishedAt = performance.now();
    const originalIndexArray = toUint32IndexArray(indexedGeometry.indexArray);
    const targetTriangleCount = getTargetTriangleCount(triangleCount);
    const targetIndexCount = Math.max(3, Math.floor(targetTriangleCount * 3));
    const weldedTriangleCount = Math.floor(originalIndexArray.length / 3);


    if (targetIndexCount >= originalIndexArray.length) {
      return geometry;
    }

    await MeshoptSimplifier.ready;

    if (!MeshoptSimplifier.supported) {
      return geometry;
    }

    const simplifyStartedAt = performance.now();
    const updatedIndexArray = originalIndexArray.slice();
    const updatedPositions = indexedGeometry.positions.slice();
    const updatedNormals = indexedGeometry.normals ? indexedGeometry.normals.slice() : new Float32Array();
    const [updatedIndexCount] = MeshoptSimplifier.simplifyWithUpdate(
      updatedIndexArray,
      updatedPositions,
      3,
      updatedNormals,
      indexedGeometry.normals ? 3 : 0,
      indexedGeometry.normals ? ATTRIBUTE_WEIGHTS : [],
      null,
      targetIndexCount,
      PREVIEW_TARGET_ERROR,
      SIMPLIFY_FLAGS,
    );
    const simplifiedIndexArray = updatedIndexArray.slice(0, updatedIndexCount);
    const simplifyFinishedAt = performance.now();

    if (simplifiedIndexArray.length >= originalIndexArray.length) {
      return geometry;
    }

    const compactStartedAt = performance.now();
    const [remap, uniqueVertexCount] = MeshoptSimplifier.compactMesh(simplifiedIndexArray);
    const compactedPositions = compactAttribute(
      updatedPositions,
      3,
      remap,
      uniqueVertexCount,
    );
    const compactedIndexArray = uniqueVertexCount > 65535
      ? simplifiedIndexArray
      : new Uint16Array(simplifiedIndexArray);
    const compactFinishedAt = performance.now();

    const simplifiedGeometry = new THREE.BufferGeometry();
    simplifiedGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(compactedPositions, 3),
    );
    simplifiedGeometry.setIndex(new THREE.BufferAttribute(compactedIndexArray, 1));
    simplifiedGeometry.computeVertexNormals();

    const edgeSplitStartedAt = performance.now();
    const edgeSplitGeometry = new EdgeSplitModifier().modify(
      simplifiedGeometry,
      CREASE_ANGLE,
      true,
    );
    edgeSplitGeometry.computeVertexNormals();
    edgeSplitGeometry.computeBoundingSphere();
    edgeSplitGeometry.computeBoundingBox();
    const edgeSplitFinishedAt = performance.now();

    onStatusChange?.('preview_compressed');

    return edgeSplitGeometry;
  } catch (error) {
    return geometry;
  }
};

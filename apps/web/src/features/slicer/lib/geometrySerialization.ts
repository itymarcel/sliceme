import * as THREE from 'three';

type SerializedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array;

export type SerializedBufferAttribute = {
  array: SerializedArray;
  itemSize: number;
  normalized: boolean;
};

export type SerializedBufferGeometry = {
  attributes: Record<string, SerializedBufferAttribute>;
  index?: SerializedBufferAttribute;
  groups: Array<{ start: number; count: number; materialIndex?: number }>;
};

export const serializeBufferGeometry = (geometry: THREE.BufferGeometry): SerializedBufferGeometry => {
  const attributes: Record<string, SerializedBufferAttribute> = {};

  Object.entries(geometry.attributes).forEach(([name, attribute]) => {
    attributes[name] = {
      array: attribute.array as SerializedArray,
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    };
  });

  return {
    attributes,
    index: geometry.index
      ? {
          array: geometry.index.array as SerializedArray,
          itemSize: geometry.index.itemSize,
          normalized: geometry.index.normalized,
        }
      : undefined,
    groups: geometry.groups.map((group) => ({
      start: group.start,
      count: group.count,
      materialIndex: group.materialIndex,
    })),
  };
};

export const deserializeBufferGeometry = (serialized: SerializedBufferGeometry): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();

  Object.entries(serialized.attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized)
    );
  });

  if (serialized.index) {
    geometry.setIndex(new THREE.BufferAttribute(
      serialized.index.array,
      serialized.index.itemSize,
      serialized.index.normalized
    ));
  }

  serialized.groups.forEach((group) => {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  });

  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  return geometry;
};

export const getGeometryTransferables = (serialized: SerializedBufferGeometry): ArrayBuffer[] => {
  const buffers = Object.values(serialized.attributes).map((attribute) => attribute.array.buffer as ArrayBuffer);
  if (serialized.index) buffers.push(serialized.index.array.buffer as ArrayBuffer);
  return buffers;
};

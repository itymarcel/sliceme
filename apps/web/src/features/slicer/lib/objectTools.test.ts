import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';

import { analyzePlacement, arrangeOnBed, duplicateDisplayName, flatSurfaceCandidates, largestFaceDownRotation, surfaceDownRotation } from './objectTools';

describe('object placement tools', () => {
  it('detects scaled objects outside the bed and overlapping objects', () => {
    const issues = analyzePlacement(
      ['a', 'b'],
      { a: { x: 8, y: 10 }, b: { x: 12, y: 10 } },
      { a: { x: 10, y: 10, z: 10 }, b: { x: 10, y: 10, z: 10 } },
      { a: { x: 2, y: 1, z: 1 }, b: { x: 1, y: 1, z: 1 } },
      { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 } },
      { x: 20, y: 20, z: 20 },
    );

    expect(issues.a).toContain('outside');
    expect(issues.a).toContain('overlap');
    expect(issues.b).toContain('overlap');
  });

  it('arranges model footprints on the bed without overlap', () => {
    const positions = arrangeOnBed(
      ['a', 'b', 'c'],
      { a: { x: 20, y: 20, z: 10 }, b: { x: 30, y: 15, z: 10 }, c: { x: 10, y: 10, z: 10 } },
      { a: { x: 1, y: 1, z: 1 }, b: { x: 1, y: 1, z: 1 }, c: { x: 1, y: 1, z: 1 } },
      { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, c: { x: 0, y: 0, z: 0 } },
      { x: 100, y: 100, z: 100 },
    );
    expect(Object.keys(positions)).toEqual(['a', 'b', 'c']);
    expect(analyzePlacement(['a', 'b', 'c'], positions, {
      a: { x: 20, y: 20, z: 10 }, b: { x: 30, y: 15, z: 10 }, c: { x: 10, y: 10, z: 10 },
    }, {}, {}, { x: 100, y: 100, z: 100 })).toEqual({});
  });

  it('creates predictable duplicate names', () => {
    expect(duplicateDisplayName('Bracket')).toBe('Bracket copy');
    expect(duplicateDisplayName('Bracket copy')).toBe('Bracket copy 2');
    expect(duplicateDisplayName('Bracket copy 2')).toBe('Bracket copy 3');
  });

  it('returns an Euler rotation that places the largest triangle face downward', () => {
    const rotation = largestFaceDownRotation(new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 0, 1,
    ]));
    const transformedNormal = new Vector3(0, 0, 1).applyEuler(new Euler(
      rotation.x * Math.PI / 180,
      rotation.y * Math.PI / 180,
      rotation.z * Math.PI / 180,
    ));
    expect(transformedNormal.z).toBeCloseTo(-1, 5);
  });

  it('uses geometry indices when choosing the largest face', () => {
    const direct = largestFaceDownRotation(new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10]));
    const indexed = largestFaceDownRotation(
      new Float32Array([0, 0, 0, 10, 0, 0, 999, 999, 999, 0, 0, 10]),
      new Uint16Array([0, 1, 3]),
    );
    expect(indexed.x).toBeCloseTo(direct.x, 5);
    expect(indexed.y).toBeCloseTo(direct.y, 5);
    expect(indexed.z).toBeCloseTo(direct.z, 5);
  });

  it('groups adjacent coplanar triangles into selectable flat surfaces', () => {
    const surfaces = flatSurfaceCandidates(new Float32Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      0, 0, 0, 1, 1, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 0, 1, 1,
    ]));

    expect(surfaces).toHaveLength(2);
    expect(surfaces[0].triangleIndices).toEqual([0, 1]);
    expect(surfaces[0].area).toBeCloseTo(1, 5);
    expect(surfaces[1].triangleIndices).toEqual([2]);
  });

  it('keeps candidate normals outward after an odd-axis mirror', () => {
    const positions = new Float32Array([
      1, 0, 0, 1, 1, 0, 1, 0, 1,
    ]);

    const [surface] = flatSurfaceCandidates(positions, undefined, { x: -2, y: 1, z: 3 });

    expect(surface.normal.x).toBeCloseTo(-1, 6);
    expect(surface.normal.y).toBeCloseTo(0, 6);
    expect(surface.normal.z).toBeCloseTo(0, 6);
  });

  it('rotates the clicked surface normal downward from the current orientation', () => {
    const rotation = surfaceDownRotation(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 90 },
    );
    const transformedNormal = new Vector3(1, 0, 0).applyEuler(new Euler(
      rotation.x * Math.PI / 180,
      rotation.y * Math.PI / 180,
      rotation.z * Math.PI / 180,
    ));

    expect(transformedNormal.x).toBeCloseTo(0, 5);
    expect(transformedNormal.y).toBeCloseTo(0, 5);
    expect(transformedNormal.z).toBeCloseTo(-1, 5);
  });
});

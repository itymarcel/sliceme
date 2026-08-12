import { describe, expect, it } from 'vitest';

import { addMeasurementPoint, closestSnapCandidate, measurementBetween, type MeasurementPoint } from './measurement';

const point = (x: number, y: number, z: number): MeasurementPoint => ({ x, y, z });

describe('measurementBetween', () => {
  it('calculates distance and signed axis deltas in millimetres', () => {
    expect(measurementBetween(point(1, 2, 3), point(4, 6, 15))).toEqual({
      distance: 13,
      dx: 3,
      dy: 4,
      dz: 12,
    });
  });
});

describe('addMeasurementPoint', () => {
  it('starts a new measurement after a completed pair', () => {
    const first = point(1, 2, 3);
    const second = point(4, 5, 6);
    const replacement = point(7, 8, 9);

    expect(addMeasurementPoint([], first)).toEqual([first]);
    expect(addMeasurementPoint([first], second)).toEqual([first, second]);
    expect(addMeasurementPoint([first, second], replacement)).toEqual([replacement]);
  });
});

describe('closestSnapCandidate', () => {
  it('returns the nearest candidate within the screen-space snap radius', () => {
    const candidates = [
      { point: point(1, 2, 3), screenX: 90, screenY: 100 },
      { point: point(4, 5, 6), screenX: 104, screenY: 103 },
    ];

    expect(closestSnapCandidate(candidates, 100, 100, 6)?.point).toEqual(point(4, 5, 6));
  });

  it('does not snap when every candidate is outside the radius', () => {
    const candidates = [{ point: point(1, 2, 3), screenX: 120, screenY: 120 }];

    expect(closestSnapCandidate(candidates, 100, 100, 10)).toBeNull();
  });
});
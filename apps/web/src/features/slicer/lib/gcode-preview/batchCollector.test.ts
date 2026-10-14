import { describe, expect, it } from 'vitest';
import { Color } from 'three';

import { SegmentBatch } from './batchCollector';

describe('SegmentBatch', () => {
  it('merges segments from several layers into one flat buffer with per-point colors', () => {
    const batch = new SegmentBatch();
    const red = new Color(0xff0000);
    const green = new Color(0x00ff00);

    batch.addSegments([0, 0, 0, 1, 0, 0], red);
    batch.addSegments([1, 0, 0, 1, 1, 0, 2, 2, 2, 3, 3, 3], green);

    expect(batch.positions).toHaveLength(18);
    expect(batch.colors).toHaveLength(18);
    expect(batch.colors.slice(0, 6)).toEqual([red.r, red.g, red.b, red.r, red.g, red.b]);
    expect(batch.colors.slice(6, 9)).toEqual([green.r, green.g, green.b]);
    expect(batch.positions.slice(6, 9)).toEqual([1, 0, 0]);
  });

  it('accepts very large layers without spreading arguments', () => {
    const batch = new SegmentBatch();
    const big = new Array<number>(300000).fill(1);

    expect(() => batch.addSegments(big, new Color(0x123456))).not.toThrow();
    expect(batch.positions).toHaveLength(300000);
    expect(batch.colors).toHaveLength(300000);
  });

  it('reports empty state and clears all data', () => {
    const batch = new SegmentBatch();
    expect(batch.isEmpty).toBe(true);

    batch.addSegments([0, 0, 0, 1, 1, 1], new Color(0xffffff));
    expect(batch.isEmpty).toBe(false);

    batch.clear();
    expect(batch.isEmpty).toBe(true);
    expect(batch.colors).toHaveLength(0);
  });
});

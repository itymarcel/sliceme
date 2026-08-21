import { describe, expect, it } from 'vitest';

import { Parser } from '../lib/gcode-preview/gcode-parser';
import { buildMoveIndex, nearestIndexedLine } from './GcodePreview';

describe('G-code edit-mode line mapping', () => {
  it('maps source lines to printer and scene points across absolute and relative moves', () => {
    const parser = new Parser(0);
    parser.parseGCode([
      'G90',
      'G1 X10 Y10 Z0.2',
      'G1 X20 Y10 E1',
      'G1 X30 Y10 E2',
      'M83',
      'G91',
      'G1 X5 Y0 E0.5',
    ].join('\n'));

    const index = buildMoveIndex({ parser }, { x: 100, y: 80, z: 100 });

    expect(index.lineNumbers).toEqual([2, 3, 4, 7]);
    expect(index.byLine.get(3)).toMatchObject({ layerIndex: 0, moveNumber: 1, printer: { x: 20, y: 10, z: 0.2 } });
    expect(index.byLine.get(7)).toMatchObject({ layerIndex: 0, moveNumber: 3, extruding: true, printer: { x: 35, y: 10, z: 0.2 } });
    expect(index.byLine.get(7)?.scene.toArray()).toEqual([-15, 0.2, 30]);
  });

  it('selects the nearest drawable move for non-motion source lines', () => {
    expect(nearestIndexedLine([10, 20, 40], 10)).toBe(10);
    expect(nearestIndexedLine([10, 20, 40], 17)).toBe(20);
    expect(nearestIndexedLine([10, 20, 40], 31)).toBe(40);
  });
});

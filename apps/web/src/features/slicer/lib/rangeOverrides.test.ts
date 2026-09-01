import { describe, expect, it } from 'vitest';

import type { RangeOverride } from '../types';
import { remapRangesToGeneratedPart } from './rangeOverrides';

describe('generated-part height ranges', () => {
  it('remaps copied ranges into the generated part local Z coordinate', () => {
    const ranges: RangeOverride[] = [{
      range: { min_z: 5, max_z: 15 },
      machine_config: {},
      process_config: { layer_height: '0.12' },
      filament_config: {},
    }];

    expect(remapRangesToGeneratedPart(ranges, 10, 8)).toEqual([{
      ...ranges[0],
      range: { min_z: 0, max_z: 5 },
    }]);
  });
});

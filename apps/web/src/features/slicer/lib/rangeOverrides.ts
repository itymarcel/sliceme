import type { RangeOverride } from '../types';

export function remapRangesToGeneratedPart(ranges: RangeOverride[], zOffset: number, partHeight: number): RangeOverride[] {
  return ranges.flatMap((range) => {
    const minZ = Math.max(0, range.range.min_z - zOffset);
    const maxZ = Math.min(partHeight, range.range.max_z - zOffset);
    return maxZ > minZ ? [{ ...structuredClone(range), range: { min_z: minZ, max_z: maxZ } }] : [];
  });
}

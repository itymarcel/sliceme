import type { Position, SlicerModel } from '../types';

const BED_Z_EPSILON = 1e-4;

export function exportedAssemblyFor(
  model: SlicerModel,
  models: SlicerModel[],
  positions: Record<string, Position>,
): string | undefined {
  const rootId = model.assemblyFor;
  if (!rootId || !models.some((candidate) => candidate.fileId === rootId)) return undefined;
  const groupIsElevated = models.some((candidate) => {
    const belongsToGroup = candidate.fileId === rootId || candidate.assemblyFor === rootId;
    return belongsToGroup && (positions[candidate.fileId]?.z ?? 0) > BED_Z_EPSILON;
  });
  return groupIsElevated ? rootId : undefined;
}

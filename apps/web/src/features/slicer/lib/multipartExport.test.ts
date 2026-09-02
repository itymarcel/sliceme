import { describe, expect, it } from 'vitest';
import type { Position, SlicerModel } from '../types';
import { exportedAssemblyFor } from './multipartExport';

const model = (fileId: string, assemblyFor?: string) => ({ fileId, ...(assemblyFor ? { assemblyFor } : {}) }) as SlicerModel;

describe('multipart export grouping', () => {
  const models = [model('lower'), model('upper', 'lower')];

  it('keeps elevated split parts in one Orca multipart object', () => {
    const positions: Record<string, Position> = {
      lower: { x: 100, y: 100, z: 0 },
      upper: { x: 100, y: 100, z: 10 },
    };
    expect(exportedAssemblyFor(models[1], models, positions)).toBe('lower');
  });

  it('exports grounded side-by-side split parts as independent Orca objects', () => {
    const positions: Record<string, Position> = {
      lower: { x: 90, y: 100, z: 0 },
      upper: { x: 130, y: 100, z: 0 },
    };
    expect(exportedAssemblyFor(models[1], models, positions)).toBeUndefined();
  });

  it('keeps the whole group multipart when any member remains elevated', () => {
    const grouped = [model('root'), model('middle', 'root'), model('top', 'root')];
    const positions: Record<string, Position> = {
      root: { x: 100, y: 100, z: 0 },
      middle: { x: 130, y: 100, z: 0 },
      top: { x: 100, y: 100, z: 20 },
    };
    expect(exportedAssemblyFor(grouped[1], grouped, positions)).toBe('root');
    expect(exportedAssemblyFor(grouped[2], grouped, positions)).toBe('root');
  });
});

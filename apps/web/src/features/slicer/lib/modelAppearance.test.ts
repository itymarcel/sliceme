import { describe, expect, it } from 'vitest';
import { DoubleSide, FrontSide } from 'three';

import { modelMaterialAppearance } from './modelAppearance';

describe('modelMaterialAppearance', () => {
  it('keeps the normal model opaque and front-sided', () => {
    expect(modelMaterialAppearance(false, false)).toEqual({
      color: '#8090a3',
      depthWrite: true,
      opacity: 1,
      side: FrontSide,
      transparent: false,
    });
  });

  it('reveals hidden surfaces in X-Ray mode without losing accent-green selection', () => {
    expect(modelMaterialAppearance(false, true)).toEqual({
      color: '#8090a3',
      depthWrite: false,
      opacity: 0.28,
      side: DoubleSide,
      transparent: true,
    });
    expect(modelMaterialAppearance(true, true).color).toBe('#89ff8e');
  });
});
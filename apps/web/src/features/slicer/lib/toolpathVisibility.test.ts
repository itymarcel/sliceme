import { describe, expect, it } from 'vitest';

import { Parser } from './gcode-preview/gcode-parser';
import { isToolpathVisible, toolpathTypesFromLayers } from './toolpathVisibility';

describe('toolpath visibility', () => {
  const parser = new Parser(0);
  const { layers } = parser.parseGCode([
    'G1 Z0.2',
    ';TYPE:Outer wall',
    'G1 X10 Y0 E1',
    ';TYPE:Sparse infill',
    'G1 X10 Y10 E2',
  ]);

  it('detects and assigns Orca toolpath types to moves', () => {
    expect(toolpathTypesFromLayers(layers)).toEqual(['Outer wall', 'Sparse infill']);
    expect(layers.flatMap((layer) => layer.commands).filter((command) => command.params.e).map((command) => command.toolpathType)).toEqual(['Outer wall', 'Sparse infill']);
  });

  it('applies Logic-style mute and solo precedence', () => {
    expect(isToolpathVisible('Outer wall', ['Outer wall'], [])).toBe(false);
    expect(isToolpathVisible('Sparse infill', ['Outer wall'], [])).toBe(true);
    expect(isToolpathVisible('Outer wall', ['Outer wall'], ['Outer wall'])).toBe(true);
    expect(isToolpathVisible('Sparse infill', [], ['Outer wall'])).toBe(false);
    expect(isToolpathVisible(undefined, [], ['Outer wall'])).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./ModelViewport.tsx', import.meta.url)), 'utf8');

describe('surface selection pointer routing', () => {
  it('lets selectable overlays receive pointer events before the base model stops propagation', () => {
    expect(source).toMatch(/onPointerDown=\{\(e\) => \{\s*if \(surfaceSelectionActive\) return;\s*e\.stopPropagation\(\)/);
    expect(source).toContain('raycast={surfaceSelectionActive ? () => null : undefined}');
  });
});

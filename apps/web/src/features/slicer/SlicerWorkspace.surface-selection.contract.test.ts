import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');

describe('workspace surface selection contract', () => {
  it('retains the AI prefill panel and wires a one-shot flat-surface selection mode', () => {
    expect(source).toContain('AiPrefillPanel');
    expect(source).toContain('prefillDescription');
    expect(source).not.toContain('onArrange=');
    expect(source).not.toContain('onLayFlat');
    expect(source).toContain('surfaceSelectionTarget');
    expect(source).toContain('onSurfaceSelected');
  });
});
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./ObjectTree.tsx', import.meta.url)), 'utf8');

describe('object tree heading actions', () => {
  it('shows model upload without the unwanted auto-arrange sparkle action', () => {
    expect(source).not.toContain('Sparkles');
    expect(source).not.toContain('Auto arrange objects');
    expect(source).not.toContain('onArrange');
    expect(source).toContain('Add models');
  });
});
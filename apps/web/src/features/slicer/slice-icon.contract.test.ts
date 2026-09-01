import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workspace = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8');

describe('slice button icon and mobile undo/redo disabled state', () => {
  it('uses the Lucide Slice icon on the Slice button instead of scissors', () => {
    expect(workspace).not.toContain('Scissors');
    expect(workspace).toMatch(/import \{[^}]*\bSlice\b[^}]*\} from 'lucide-react';/);
    const sliceButtons = workspace.match(/Slice size=\{\d+\} \/> Slice<\/button>/g) ?? [];
    expect(sliceButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders mobile undo/redo in a disabled visual state when no history exists', () => {
    expect(styles).toContain('.mobile-header-button:disabled');
    expect(styles).toContain('.mobile-navbar-actions');
  });
});

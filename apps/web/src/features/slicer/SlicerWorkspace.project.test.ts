import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const workspace = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');
const moreMenu = readFileSync(fileURLToPath(new URL('./components/HeaderMoreMenu.tsx', import.meta.url)), 'utf8');
const hook = readFileSync(fileURLToPath(new URL('./hooks/useSlicerWorkspace.ts', import.meta.url)), 'utf8');

describe('workspace header controls', () => {
  it('places project actions in an overflow menu', () => {
    expect(workspace).toContain('accept=".3mf"');
    expect(moreMenu).toContain('More project actions');
    expect(workspace).toContain('<HeaderMoreMenu');
    expect(workspace).not.toContain('<ProjectLinks />');
    expect(moreMenu).toContain('Add model');
    expect(moreMenu).toContain('Import *.3mf');
    expect(moreMenu).toContain('Export 3MF');
    expect(moreMenu).not.toContain('Buy Me a Coffee');
    expect(workspace).toContain('<SupportLink />');
    expect(workspace).toContain('Session saved locally in browser storage');
    expect(workspace).toContain('workspace.importProject');
    expect(workspace).toContain('workspace.exportProject');
  });

  it('centers undo and redo controls and uses generic slicing copy', () => {
    expect(workspace).toContain('header-history');
    expect(workspace).toContain('aria-label="Undo"');
    expect(workspace).toContain('aria-label="Redo"');
    expect(workspace).toContain('Slicer engine is working');
    expect(workspace).not.toContain('OrcaSlicer is working');
  });

  it('keeps Slice rightmost and styles Download as secondary', () => {
    expect(workspace).toContain('className="button secondary download"');
    expect(workspace.indexOf('className="button secondary download"')).toBeLessThan(workspace.indexOf('<Scissors size={15} /> Slice'));
  });

  it('persists and restores setting history with the browser session', () => {
    expect(hook).toContain('setHistory(snapshot.history ?? createWorkspaceHistory())');
    expect(hook).toContain('history,');
  });
});

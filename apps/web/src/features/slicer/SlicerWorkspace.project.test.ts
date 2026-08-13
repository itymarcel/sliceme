import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const workspace = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');

describe('Orca 3MF project controls', () => {
  it('offers separate import and export controls beside Add model', () => {
    expect(workspace).toContain('accept=".3mf"');
    expect(workspace).toContain('Import *.3mf');
    expect(workspace).toContain('Export 3MF');
    expect(workspace).toMatch(/Import \*\.3mf<\/button>\s*<button[^>]+disabled=\{!workspace\.models\.length/);
    expect(workspace).toContain('workspace.importProject');
    expect(workspace).toContain('workspace.exportProject');
  });
});

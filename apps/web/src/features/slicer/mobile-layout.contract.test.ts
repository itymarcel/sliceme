import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const workspace = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8');

describe('mobile phone workspace', () => {
  it('provides a Settings-controlled near-full-screen objects and settings overlay', () => {
    expect(workspace).toContain('<SlidersHorizontal size={14}');
    expect(workspace).toContain('<span>Settings</span>');
    expect(workspace).toContain('mobile-navbar-actions');
    expect(workspace).toContain('mobile-navbar-slice');
    expect(workspace).toContain('mobileSettingsOpen');
    expect(workspace).toContain('Open objects and slicer settings');
    expect(workspace).toContain('Close objects and slicer settings');
    expect(workspace).toContain('mobile-settings-backdrop');
    expect(workspace).toContain('mobile-settings-header');
    expect(workspace).toContain('mobile-settings-open');
    expect(styles).toContain('cubic-bezier(.215,.61,.355,1)');
    expect(styles).toContain('scale(.95)');
  });

  it('stacks STL and G-code viewers across a horizontal divider at phone width', () => {
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.work-area\.with-gcode\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.work-area\.expanded-model,\s*\.work-area\.expanded-gcode\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(styles).toMatch(/\.camera-controls \.camera-preset\s*\{[^}]*display:\s*none/);
    expect(styles).toMatch(/\.sidebar\s*\{[^}]*position:\s*fixed;[^}]*inset:/);
  });
});

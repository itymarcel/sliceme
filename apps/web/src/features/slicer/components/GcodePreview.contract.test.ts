import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const component = readFileSync(fileURLToPath(new URL('./GcodePreview.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../../../styles.css', import.meta.url)), 'utf8');

describe('G-code toolbar presentation', () => {
  it('uses a boxed mode selector and the BroomSparkles enhancement icon', () => {
    expect(component).toContain('BroomSparkles');
    expect(component).toContain('className="segmented preview-mode-selector"');
    expect(component).toMatch(/<BroomSparkles size=\{14\} \/> Enhance/);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*padding:/s);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*border:/s);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*background:/s);
    expect(styles).toMatch(/\.preview-meta\s*\{[^}]*height:\s*36px/s);
  });

  it('does not move buttons vertically on hover', () => {
    expect(styles).not.toMatch(/:hover[^\{]*\{[^}]*transform:\s*translateY\(\s*-\d/s);
  });
});

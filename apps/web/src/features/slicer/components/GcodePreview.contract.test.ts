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
    expect(component).toMatch(/applied \? <Check size=\{14\} \/> : <BroomSparkles size=\{13\} \/>/);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*padding:/s);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*border:/s);
    expect(styles).toMatch(/\.preview-mode-selector\s*\{[^}]*background:/s);
    expect(component).not.toContain('className="preview-meta"');
    expect(component).toContain('className="gcode-toolbar-controls"');
    expect(component).not.toContain('label="Travel"');
    expect(component).toContain("TRAVEL_TOOLPATH");
    expect(component).not.toContain('onTravelChange');
    expect(component).toContain('<section className="gcode-preview">');
    expect(component).toContain('expanded={expanded}');
    expect(component).not.toContain('requestFullscreen');
    expect(component).not.toContain('fullscreenElement');
    expect(styles).toMatch(/\.gcode-toolbar-controls\s*\{/s);
  });

  it('does not move buttons vertically on hover', () => {
    expect(styles).not.toMatch(/:hover[^\{]*\{[^}]*transform:\s*translateY\(\s*-\d/s);
  });
});

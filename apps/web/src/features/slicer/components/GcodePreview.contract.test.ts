import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const component = readFileSync(fileURLToPath(new URL('./GcodePreview.tsx', import.meta.url)), 'utf8');
const styles = readFileSync(fileURLToPath(new URL('../../../styles.css', import.meta.url)), 'utf8');

describe('G-code toolbar presentation', () => {
  it('uses an edit-mode button and the BroomSparkles enhancement icon', () => {
    expect(component).toContain('BroomSparkles');
    expect(component).toContain('gcode-edit-mode-toggle');
    expect(component).toContain('Edit G-code');
    expect(component).toContain('gcode-source-overlay');
    expect(component).not.toContain('preview-mode-selector');
    expect(component).toMatch(/<BroomSparkles size=\{14\} \/> Enhance/);
    expect(component).toMatch(/applied \? <Check size=\{14\} \/> : <BroomSparkles size=\{13\} \/>/);
    expect(styles).toMatch(/\.gcode-edit-mode-toggle\s*\{[^}]*padding:/s);
    expect(styles).toMatch(/\.gcode-source-overlay\s*\{[^}]*position:\s*absolute/s);
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

  it('provides compact tappable mobile print info without hiding Toolpaths', () => {
    expect(component).toContain('statsCollapsed');
    expect(component).toContain('Print Info');
    expect(component).toContain("role={isMobile ? 'button' : undefined}");
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.gcode-stats\s*\{[^}]*top:\s*6px;[^}]*left:\s*6px/);
    expect(styles).toMatch(/\.gcode-stats\.is-collapsed\s*\{/);
    expect(styles).toMatch(/\.gcode-toolbar-controls\s*\{[^}]*overflow:\s*visible/);
    expect(styles).toMatch(/\.toolpath-controls\s*\{[^}]*flex:\s*0 0 auto/);
  });
});

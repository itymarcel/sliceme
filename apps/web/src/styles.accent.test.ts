import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('application accent boundary', () => {
  it('uses #89FF8E for app chrome and model selection while retaining G-code yellow', () => {
    const styles = source('./styles.css');
    const modelAppearance = source('./features/slicer/lib/modelAppearance.ts');
    const gcodePreview = source('./features/slicer/components/GcodePreview.tsx');

    expect(styles.toLowerCase()).toContain('--accent: #89ff8e');
    expect(styles).not.toContain('rgba(238,238,69');
    expect(modelAppearance.toLowerCase()).toContain("'#89ff8e'");
    expect(gcodePreview.toLowerCase()).toContain("'#eeee45'");
  });
});
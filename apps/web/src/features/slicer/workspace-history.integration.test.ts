import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const hook = readFileSync(fileURLToPath(new URL('./hooks/useSlicerWorkspace.ts', import.meta.url)), 'utf8');
const workspace = readFileSync(fileURLToPath(new URL('./SlicerWorkspace.tsx', import.meta.url)), 'utf8');

describe('workspace model and transform history integration', () => {
  it('captures model membership and transforms in the unified snapshot', () => {
    expect(hook).toContain('modelOrder: models.map');
    expect(hook).toContain('positions,');
    expect(hook).toContain('rotations,');
    expect(hook).toContain('scales,');
    expect(hook).toContain('modelNames,');
    expect(hook).toContain('selectedFileIds,');
    expect(hook).toContain('startPositions,');
    expect(hook).toContain('modelRegistry');
  });

  it('records model add/remove and one drag-start history point', () => {
    expect(hook).toContain('recordWorkspaceChange();\n    setModels');
    expect(hook).toContain('beginTransformChange');
    expect(workspace).toContain('onDragStart={workspace.beginTransformChange}');
    expect(workspace).toContain('workspace.setPositions((current)');
    expect(workspace).toContain('workspace.setRotations((current)');
    expect(workspace).toContain('workspace.setScales((current)');
    expect(workspace).toContain('workspace.duplicateSelected');
    expect(workspace).not.toContain('workspace.autoArrange');
  });
});

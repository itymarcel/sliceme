import { describe, expect, it } from 'vitest';

import {
  createWorkspaceHistory,
  recordWorkspaceChange,
  redoWorkspaceChange,
  undoWorkspaceChange,
  type WorkspaceHistorySnapshot,
} from './workspaceHistory';

const snapshot = (value: string): WorkspaceHistorySnapshot => ({
  modelOrder: ['model-a'],
  config: { machine_config: {}, filament_config: {}, process_config: { layer_height: value } },
  fileOverrides: {},
  rangeOverrides: {},
  positions: { 'model-a': { x: Number(value), y: 20 } },
  rotations: { 'model-a': { x: 0, y: 0, z: Number(value) } },
  startPositions: {},
  selectedNode: { type: 'scene' as const },
});

describe('workspace history', () => {
  it('undoes and redoes snapshots', () => {
    const initial = snapshot('0.2');
    const changed = snapshot('0.3');
    const recorded = recordWorkspaceChange(createWorkspaceHistory(), initial);
    const undone = undoWorkspaceChange(recorded, changed);
    expect(undone.snapshot).toEqual(initial);
    expect(undone.history.future).toEqual([changed]);
    const redone = redoWorkspaceChange(undone.history, initial);
    expect(redone.snapshot).toEqual(changed);
  });

  it('clears redo after a new edit and bounds past history', () => {
    const initial = snapshot('0.2');
    const changed = snapshot('0.3');
    const undone = undoWorkspaceChange(recordWorkspaceChange(createWorkspaceHistory(), initial), changed);
    const branched = recordWorkspaceChange(undone.history, snapshot('0.25'));
    expect(branched.future).toEqual([]);

    let history = createWorkspaceHistory();
    for (let index = 0; index < 60; index += 1) history = recordWorkspaceChange(history, snapshot(String(index)));
    expect(history.past).toHaveLength(50);
  });

  it('restores model membership, position, and rotation together', () => {
    const beforeAdd = { ...snapshot('0.2'), modelOrder: [] };
    const afterAdd = snapshot('0.3');
    const undone = undoWorkspaceChange(recordWorkspaceChange(createWorkspaceHistory(), beforeAdd), afterAdd);
    expect(undone.snapshot?.modelOrder).toEqual([]);
    const redone = redoWorkspaceChange(undone.history, beforeAdd);
    expect(redone.snapshot?.modelOrder).toEqual(['model-a']);
    expect(redone.snapshot?.positions['model-a']).toEqual({ x: 0.3, y: 20 });
    expect(redone.snapshot?.rotations['model-a']).toEqual({ x: 0, y: 0, z: 0.3 });
  });
});

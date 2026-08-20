import type { ConfigBundle, Position, RangeOverride, Rotation, Scale, SelectedNode } from '../types';

export type WorkspaceHistorySnapshot = {
  modelOrder: string[];
  config: ConfigBundle;
  fileOverrides: Record<string, Partial<ConfigBundle>>;
  rangeOverrides: Record<string, RangeOverride[]>;
  positions: Record<string, Position>;
  rotations: Record<string, Rotation>;
  scales: Record<string, Scale>;
  modelNames: Record<string, string>;
  startPositions: Record<string, Position>;
  selectedFileIds: string[];
  selectedNode: SelectedNode;
};

export type WorkspaceHistory = {
  past: WorkspaceHistorySnapshot[];
  future: WorkspaceHistorySnapshot[];
};

const HISTORY_LIMIT = 50;
const clone = (snapshot: WorkspaceHistorySnapshot): WorkspaceHistorySnapshot => structuredClone(snapshot);

export const createWorkspaceHistory = (): WorkspaceHistory => ({ past: [], future: [] });

export const recordWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceHistorySnapshot): WorkspaceHistory => ({
  past: [...history.past, clone(current)].slice(-HISTORY_LIMIT),
  future: [],
});

export const undoWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceHistorySnapshot) => {
  const snapshot = history.past.at(-1);
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: history.past.slice(0, -1), future: [clone(current), ...history.future] },
    snapshot: clone(snapshot),
  };
};

export const redoWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceHistorySnapshot) => {
  const snapshot = history.future[0];
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: [...history.past, clone(current)].slice(-HISTORY_LIMIT), future: history.future.slice(1) },
    snapshot: clone(snapshot),
  };
};

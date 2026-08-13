import type { ConfigBundle, RangeOverride, SelectedNode } from '../types';

export type WorkspaceSettingsSnapshot = {
  config: ConfigBundle;
  fileOverrides: Record<string, Partial<ConfigBundle>>;
  rangeOverrides: Record<string, RangeOverride[]>;
  selectedNode: SelectedNode;
};

export type WorkspaceHistory = {
  past: WorkspaceSettingsSnapshot[];
  future: WorkspaceSettingsSnapshot[];
};

const HISTORY_LIMIT = 50;
const clone = (snapshot: WorkspaceSettingsSnapshot): WorkspaceSettingsSnapshot => structuredClone(snapshot);

export const createWorkspaceHistory = (): WorkspaceHistory => ({ past: [], future: [] });

export const recordWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceSettingsSnapshot): WorkspaceHistory => ({
  past: [...history.past, clone(current)].slice(-HISTORY_LIMIT),
  future: [],
});

export const undoWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceSettingsSnapshot) => {
  const snapshot = history.past.at(-1);
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: history.past.slice(0, -1), future: [clone(current), ...history.future] },
    snapshot: clone(snapshot),
  };
};

export const redoWorkspaceChange = (history: WorkspaceHistory, current: WorkspaceSettingsSnapshot) => {
  const snapshot = history.future[0];
  if (!snapshot) return { history, snapshot: null };
  return {
    history: { past: [...history.past, clone(current)].slice(-HISTORY_LIMIT), future: history.future.slice(1) },
    snapshot: clone(snapshot),
  };
};

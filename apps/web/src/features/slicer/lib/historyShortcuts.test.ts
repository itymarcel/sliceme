// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { isEditableShortcutTarget } from './historyShortcuts';

describe('workspace history shortcuts', () => {
  it('preserves native editing shortcuts for every editable control', () => {
    for (const element of [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
    ]) {
      expect(isEditableShortcutTarget(element)).toBe(true);
    }

    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isEditableShortcutTarget(editable)).toBe(true);
    expect(isEditableShortcutTarget(document.createElement('button'))).toBe(false);
    expect(isEditableShortcutTarget(null)).toBe(false);
  });
});

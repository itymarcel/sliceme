// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MobileActionsMenu } from './MobileActionsMenu';

afterEach(cleanup);

const callbacks = {
  onAddModel: vi.fn(),
  onImportProject: vi.fn(),
  onExportProject: vi.fn(),
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onClear: vi.fn(),
};

const renderMenu = () => render(<MobileActionsMenu
  {...callbacks}
  canUndo
  canRedo
  canClear
  importingDisabled={false}
  exportingDisabled={false}
  download={{ href: 'blob:gcode', fileName: 'part.gcode' }}
/>);

describe('MobileActionsMenu', () => {
  it('opens a hamburger containing all workspace actions', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open main menu' });
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    ['Add model', 'Import *.3mf', 'Export 3MF', 'Download G-code', 'Undo', 'Redo', 'Clear workspace'].forEach((name) => {
      expect(screen.getByRole(name === 'Download G-code' ? 'link' : 'button', { name })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Slice' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Support SliceMe on Buy Me a Coffee' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'SliceMe on GitHub' })).toBeTruthy();
  });

  it('runs an action, closes, and restores focus after Escape', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Open main menu' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(callbacks.onAddModel).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});

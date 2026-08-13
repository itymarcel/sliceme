// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeaderMoreMenu } from './HeaderMoreMenu';

afterEach(cleanup);

const props = {
  onAddModel: vi.fn(),
  onImportProject: vi.fn(),
  onExportProject: vi.fn(),
  importingDisabled: false,
  exportingDisabled: false,
};

describe('HeaderMoreMenu', () => {
  it('uses disclosure semantics and restores trigger focus after Escape', () => {
    render(<HeaderMoreMenu {...props} />);
    const trigger = screen.getByRole('button', { name: 'More project actions' });

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByLabelText('Project actions')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByLabelText('Project actions')).toBeNull();
  });
});

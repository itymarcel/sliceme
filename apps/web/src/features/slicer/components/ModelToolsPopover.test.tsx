// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelToolsPopover } from './ModelToolsPopover';

const props = () => ({
  modelName: 'Bracket',
  bounds: { min: { x: -10, y: -5, z: 0 }, max: { x: 10, y: 5, z: 20 } },
  busy: false,
  onClose: vi.fn(),
  onRepair: vi.fn(),
  onSplit: vi.fn(),
  onCut: vi.fn(),
});

afterEach(cleanup);

describe('model tools popover', () => {
  it('uses standard UI buttons and omits the redundant variable-layer editor', async () => {
    const user = userEvent.setup();
    const value = props();
    const { container } = render(<ModelToolsPopover {...value} />);

    await user.click(screen.getByRole('button', { name: 'Repair mesh' }));
    await user.click(screen.getByRole('button', { name: 'Split disconnected shells' }));

    expect(value.onRepair).toHaveBeenCalledOnce();
    expect(value.onSplit).toHaveBeenCalledOnce();
    expect(screen.queryByText('Variable layer heights')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelectorAll('.button.secondary')).toHaveLength(2);
  });

  it('submits a cut plane and keeps both closed parts', async () => {
    const user = userEvent.setup();
    const value = props();
    render(<ModelToolsPopover {...value} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cut axis' }), 'z');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cut position' }), { target: { value: '12.5' } });
    await user.click(screen.getByRole('button', { name: 'Cut and keep both parts' }));

    expect(value.onCut).toHaveBeenCalledWith('z', 12.5);
  });

  it('closes on Escape', () => {
    const value = props();
    render(<ModelToolsPopover {...value} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(value.onClose).toHaveBeenCalledOnce();
  });
});

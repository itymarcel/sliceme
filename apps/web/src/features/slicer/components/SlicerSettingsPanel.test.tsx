// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlicerSettingsPanel } from './SlicerSettingsPanel';
import type { ConfigBundle } from '../types';

const config: ConfigBundle = {
  machine_config: {
    machine_start_gcode: 'G28 ; home',
    machine_end_gcode: 'M84',
  },
  filament_config: {},
  process_config: {},
};

const props = () => ({
  selectedNode: { type: 'scene' as const },
  config,
  fileOverrides: {},
  rangeOverrides: {},
  onChange: vi.fn(),
  onClear: vi.fn(),
  onRangeBoundary: vi.fn(),
  section: 'machine_config' as const,
  query: '',
  onSectionChange: vi.fn(),
  onQueryChange: vi.fn(),
  highlightedFields: {},
  onFieldInteract: vi.fn(),
});

afterEach(cleanup);

describe('G-code setting editor', () => {
  it('marks AI recommendations with an icon and clears the marker on interaction', async () => {
    const user = userEvent.setup();
    const panelProps = props();
    panelProps.highlightedFields = { machine_config: ['nozzle_type'] };
    render(<SlicerSettingsPanel {...panelProps} />);

    expect(screen.getByLabelText('AI recommended')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Nozzle type'), 'brass');
    expect(panelProps.onFieldInteract).toHaveBeenCalledWith('machine_config', 'nozzle_type');
  });

  it('opens an overlay and saves the edited G-code explicitly', async () => {
    const user = userEvent.setup();
    const panelProps = props();
    render(<SlicerSettingsPanel {...panelProps} />);

    await user.click(screen.getByRole('button', { name: 'Edit Start G-code' }));
    const editor = screen.getByRole('textbox', { name: 'Start G-code' });
    expect((editor as HTMLTextAreaElement).value).toBe('G28 ; home');

    await user.clear(editor);
    await user.type(editor, 'G28\nG29');
    expect(panelProps.onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save G-code' }));
    expect(panelProps.onChange).toHaveBeenCalledWith('machine_config', 'machine_start_gcode', 'G28\nG29');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('discards the draft when Escape closes the overlay', async () => {
    const user = userEvent.setup();
    const panelProps = props();
    render(<SlicerSettingsPanel {...panelProps} />);

    await user.click(screen.getByRole('button', { name: 'Edit End G-code' }));
    await user.type(screen.getByRole('textbox', { name: 'End G-code' }), ' changed');
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(panelProps.onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

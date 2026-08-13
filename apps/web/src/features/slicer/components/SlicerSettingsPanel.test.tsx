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
  process_config: { skirt_loops: '0' },
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
  it('opens parameter help on click and closes it outside or with Escape', async () => {
    const user = userEvent.setup();
    render(<SlicerSettingsPanel {...props()} />);

    const info = screen.getByRole('button', { name: 'About Nozzle diameter' });
    expect(screen.getByRole('combobox', { name: 'Nozzle diameter' })).toBeTruthy();
    await user.click(info);
    expect(screen.getByRole('dialog', { name: 'Nozzle diameter information' })).toBeTruthy();
    expect(info.getAttribute('aria-expanded')).toBe('true');

    await user.click(screen.getByRole('heading', { name: 'Build volume' }));
    expect(screen.queryByRole('dialog', { name: 'Nozzle diameter information' })).toBeNull();

    await user.click(info);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Nozzle diameter information' })).toBeNull();
  });

  it('keeps range help outside explicitly associated input labels', () => {
    const panelProps = {
      ...props(),
      selectedNode: { type: 'range' as const, fileId: 'model-1', rangeIndex: 0 },
      section: 'process_config' as const,
      rangeOverrides: { 'model-1': [{
        range: { min_z: 2, max_z: 8 },
        machine_config: {},
        filament_config: {},
        process_config: {},
      }] },
    };
    render(<SlicerSettingsPanel {...panelProps} />);

    expect(screen.getByRole('spinbutton', { name: 'From' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'To' })).toBeTruthy();
    expect(document.querySelector('label button.parameter-help-trigger')).toBeNull();
  });

  it('uses Orca support type names rather than a false placement label', () => {
    render(<SlicerSettingsPanel {...props()} section="process_config" />);
    expect(screen.getByLabelText('Support type')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Normal (manual)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Tree (manual)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Build plate only' })).toBeNull();
  });

  it('exposes Orca brim and fuzzy-skin values with their real meanings', () => {
    render(<SlicerSettingsPanel {...props()} section="process_config" />);
    for (const label of ['Automatic', 'Mouse ear', 'Painted', 'Outer only', 'Inner only', 'Outer and inner', 'None']) {
      expect(screen.getByRole('option', { name: label })).toBeTruthy();
    }
    for (const label of ['Painted only', 'Contour', 'Hole', 'Contour and hole', 'All walls', 'Disabled']) {
      expect(screen.getByRole('option', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('option', { name: 'Painted only' }).getAttribute('value')).toBe('none');
    expect(screen.getByRole('option', { name: 'Disabled' }).getAttribute('value')).toBe('disabled_fuzzy');
  });

  it('exposes skirt loops as the skirt enable control', () => {
    const panelProps = props();
    render(<SlicerSettingsPanel {...panelProps} section="process_config" />);
    const loops = screen.getByRole('spinbutton', { name: 'Skirt loops' }) as HTMLInputElement;
    expect(loops.value).toBe('0');
    expect(loops.min).toBe('0');
    expect(loops.max).toBe('10');
    expect(screen.getByRole('button', { name: 'About Skirt loops' })).toBeTruthy();
    fireEvent.change(loops, { target: { value: '1' } });
    expect(panelProps.onChange).toHaveBeenCalledWith('process_config', 'skirt_loops', '1');
  });

  it('renders distinct diagrams for brim placement and brim width', async () => {
    const user = userEvent.setup();
    render(<SlicerSettingsPanel {...props()} section="process_config" />);
    await user.click(screen.getByRole('button', { name: 'About Brim' }));
    const brimSvg = screen.getByRole('dialog', { name: 'Brim information' }).querySelector('svg');
    expect(brimSvg).toBeTruthy();
    const brimMarkup = brimSvg?.innerHTML;

    await user.click(screen.getByRole('button', { name: 'About Brim width' }));
    const widthSvg = screen.getByRole('dialog', { name: 'Brim width information' }).querySelector('svg');
    expect(widthSvg).toBeTruthy();
    expect(widthSvg?.innerHTML).not.toBe(brimMarkup);
  });

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

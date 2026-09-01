// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransformPanel } from './TransformPanel';

afterEach(cleanup);

describe('transform controls', () => {
  it('keeps model-tool trigger clicks from immediately closing the attached popover', () => {
    const onParentClick = vi.fn();
    const onModelTools = vi.fn();
    render(<div onClick={onParentClick}><TransformPanel
      position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }}
      onPosition={vi.fn()} onRotation={vi.fn()} onModelTools={onModelTools}
      modelToolsOpen modelToolsPopover={<div>Attached tools</div>}
    /></div>);

    fireEvent.click(screen.getByRole('button', { name: 'Open model tools' }));

    expect(onModelTools).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getByText('Attached tools')).toBeTruthy();
  });
  it('keeps every axis editable without adjacent information buttons and without position/rotation text labels', () => {
    const { container } = render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);

    const labels = ['Position X', 'Position Y', 'Rotation X', 'Rotation Y', 'Rotation Z'];
    labels.forEach((label) => {
      expect(screen.getByRole('spinbutton', { name: label })).toBeTruthy();
      expect(screen.queryByRole('button', { name: `About ${label}` })).toBeNull();
    });
    // The group heading should only carry the icon, not a "Position"/"Rotation" text label.
    expect(container.querySelector('.transform-group > span')?.textContent).not.toMatch(/Position|Rotation/);
    expect(container.querySelector('.position-group .transform-column-spacer')).toBeTruthy();
    expect(container.querySelectorAll('.position-group .transform-field')).toHaveLength(2);
    expect(container.querySelectorAll('.rotation-group .transform-field')).toHaveLength(3);
  });

  it('renders editable number inputs so a leading zero can be replaced by typing', () => {
    render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);
    const input = screen.getByRole('spinbutton', { name: 'Rotation Z' }) as HTMLInputElement;
    expect(input.readOnly).toBe(false);
    expect(input.disabled).toBe(false);
    expect(input.type).toBe('number');
  });

  it('renders a clockwise rotate overlay per rotation axis, hidden while that input is focused', () => {
    render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 10, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Rotate [XYZ] clockwise 45 degrees/ }).length).toBe(3);
    expect(screen.queryByRole('button', { name: 'Rotate X by 45 degrees' })).toBeNull();
    const input = screen.getByRole('spinbutton', { name: 'Rotation X' });
    fireEvent.focus(input);
    expect(screen.queryByRole('button', { name: 'Rotate X clockwise 45 degrees' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Rotate [YZ] clockwise 45 degrees/ }).length).toBe(2);
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Rotate X clockwise 45 degrees' })).toBeTruthy();
  });

  it('exposes uniform scaling, mirroring, and object actions', () => {
    const onScale = vi.fn();
    const onMirror = vi.fn();
    const onDuplicate = vi.fn();
    const onCenter = vi.fn();
    const onSelectSurface = vi.fn();
    render(<TransformPanel
      position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} scale={{ x: 1, y: 1, z: 1 }}
      onPosition={vi.fn()} onRotation={vi.fn()} onScale={onScale} onMirror={onMirror}
      onDuplicate={onDuplicate} onCenter={onCenter} onSelectSurface={onSelectSurface} surfaceSelectionActive
    />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Scale percent' }), { target: { value: '150' } });
    expect(onScale).toHaveBeenCalledWith({ x: 1.5, y: 1.5, z: 1.5 });
    fireEvent.click(screen.getByRole('button', { name: 'Mirror X' }));
    expect(onMirror).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate object' }));
    fireEvent.click(screen.getByRole('button', { name: 'Center object' }));
    const selectSurface = screen.getByRole('button', { name: 'Cancel flat surface selection' });
    expect(selectSurface.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Lay largest face flat' })).toBeNull();
    fireEvent.click(selectSurface);
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onCenter).toHaveBeenCalledOnce();
    expect(onSelectSurface).toHaveBeenCalledOnce();
  });

  it('places Center beside the mirror controls and uses the short Select flat label', () => {
    render(<TransformPanel
      position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} scale={{ x: 1, y: 1, z: 1 }}
      onPosition={vi.fn()} onRotation={vi.fn()} onScale={vi.fn()} onMirror={vi.fn()}
      onCenter={vi.fn()} onSelectSurface={vi.fn()}
    />);

    const center = screen.getByRole('button', { name: 'Center object' });
    expect(center.classList.contains('transform-action')).toBe(true);
    expect(center.closest('.scale-group')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select flat surface' }).textContent).toContain('Select flat');
    expect(screen.getByRole('button', { name: 'Select flat surface' }).textContent).not.toContain('surface');
  });
});

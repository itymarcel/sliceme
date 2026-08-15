// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransformPanel } from './TransformPanel';

afterEach(cleanup);

describe('transform controls', () => {
  it('keeps every axis editable without adjacent information buttons and without position/rotation text labels', () => {
    const { container } = render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);

    const labels = ['Position X', 'Position Y', 'Rotation X', 'Rotation Y', 'Rotation Z'];
    labels.forEach((label) => {
      expect(screen.getByRole('spinbutton', { name: label })).toBeTruthy();
      expect(screen.queryByRole('button', { name: `About ${label}` })).toBeNull();
    });
    // The group heading should only carry the icon, not a "Position"/"Rotation" text label.
    expect(container.querySelector('.transform-group > span')?.textContent).not.toMatch(/Position|Rotation/);
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

  it('rotates 45 degrees clockwise around the chosen axis and keeps the value within 0-359', () => {
    const onRotation = vi.fn();
    render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 10, y: 0, z: 350 }} onPosition={vi.fn()} onRotation={onRotation} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rotate X clockwise 45 degrees' }));
    expect(onRotation).toHaveBeenCalledWith({ x: 55, y: 0, z: 350 });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate Z clockwise 45 degrees' }));
    expect(onRotation).toHaveBeenCalledWith({ x: 10, y: 0, z: 35 });
  });
});

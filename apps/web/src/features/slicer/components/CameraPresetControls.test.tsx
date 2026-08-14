// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CameraPresetControls } from './CameraPresetControls';

describe('CameraPresetControls', () => {
  it('uses Scan as a fullscreen toggle', () => {
    const onToggleFullscreen = vi.fn();
    render(<CameraPresetControls fullscreen={false} onToggleFullscreen={onToggleFullscreen} onTop={vi.fn()} onFront={vi.fn()} onRight={vi.fn()} onCenter={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Enter fullscreen' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleFullscreen).toHaveBeenCalledOnce();
  });
});
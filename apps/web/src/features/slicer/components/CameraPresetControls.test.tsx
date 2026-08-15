// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CameraPresetControls } from './CameraPresetControls';

describe('CameraPresetControls', () => {
  it('uses Scan as an in-app expanded-view toggle', () => {
    const onToggleExpanded = vi.fn();
    render(<CameraPresetControls expanded={false} viewerLabel="G-code" onToggleExpanded={onToggleExpanded} onTop={vi.fn()} onFront={vi.fn()} onRight={vi.fn()} onCenter={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Expand G-code viewer' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledOnce();
  });
});
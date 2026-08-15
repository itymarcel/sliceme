// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CameraPresetControls } from './CameraPresetControls';

afterEach(cleanup);

describe('CameraPresetControls', () => {
  it('uses Scan as an in-app expanded-view toggle', () => {
    const onToggleExpanded = vi.fn();
    render(<CameraPresetControls expanded={false} viewerLabel="G-code" onToggleExpanded={onToggleExpanded} onTop={vi.fn()} onFront={vi.fn()} onRight={vi.fn()} onCenter={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Expand G-code viewer' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledOnce();
  });

  it('exposes a pressed X-Ray inspection toggle for the model viewer', () => {
    const onToggleXray = vi.fn();
    render(
      <CameraPresetControls
        expanded={false}
        viewerLabel="model"
        xray
        onToggleXray={onToggleXray}
        onToggleExpanded={vi.fn()}
        onTop={vi.fn()}
        onFront={vi.fn()}
        onRight={vi.fn()}
        onCenter={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Disable X-Ray model inspection' });
    expect(toggle.querySelector('.lucide-sun')).not.toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(onToggleXray).toHaveBeenCalledOnce();
  });

  it('marks camera presets separately from fullscreen and X-Ray controls', () => {
    render(<CameraPresetControls expanded={false} viewerLabel="model" xray={false} onToggleXray={vi.fn()} onToggleExpanded={vi.fn()} onTop={vi.fn()} onFront={vi.fn()} onRight={vi.fn()} onCenter={vi.fn()} />);
    ['Top', 'Front', 'Right', 'Fit'].forEach((name) => expect(screen.getByRole('button', { name }).classList.contains('camera-preset')).toBe(true));
    expect(screen.getByRole('button', { name: 'Expand model viewer' }).classList.contains('camera-preset')).toBe(false);
    expect(screen.getByRole('button', { name: 'Enable X-Ray model inspection' }).classList.contains('camera-preset')).toBe(false);
  });
});
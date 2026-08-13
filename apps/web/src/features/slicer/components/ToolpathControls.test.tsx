// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolpathControls } from './ToolpathControls';

afterEach(cleanup);

describe('ToolpathControls', () => {
  it('opens a dropdown and sends independent mute and solo changes', () => {
    const onMutedChange = vi.fn();
    const onSoloedChange = vi.fn();
    render(<ToolpathControls types={['Outer wall', 'Sparse infill']} muted={[]} soloed={[]} onMutedChange={onMutedChange} onSoloedChange={onSoloedChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toolpaths' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute Outer wall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo Sparse infill' }));

    expect(onMutedChange).toHaveBeenCalledWith(['Outer wall']);
    expect(onSoloedChange).toHaveBeenCalledWith(['Sparse infill']);
  });
});

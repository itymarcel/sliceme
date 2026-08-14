// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolpathControls } from './ToolpathControls';

afterEach(cleanup);

describe('ToolpathControls', () => {
  it('opens a dropdown and sends independent mute and solo changes', () => {
    const onMutedChange = vi.fn();
    const onSoloedChange = vi.fn();
    const onClear = vi.fn();
    const onColorByTypeChange = vi.fn();
    render(<ToolpathControls types={['Travel moves', 'Outer wall', 'Sparse infill']} muted={[]} soloed={[]} colorByType={false} onColorByTypeChange={onColorByTypeChange} onClear={onClear} onMutedChange={onMutedChange} onSoloedChange={onSoloedChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toolpaths' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute Outer wall' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo Sparse infill' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute Travel moves' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo Travel moves' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear M/S' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use different toolpath colours' }));

    expect(onMutedChange).toHaveBeenCalledWith(['Outer wall']);
    expect(onSoloedChange).toHaveBeenCalledWith(['Sparse infill']);
    expect(onMutedChange).toHaveBeenCalledWith(['Travel moves']);
    expect(onSoloedChange).toHaveBeenCalledWith(['Travel moves']);
    expect(onClear).toHaveBeenCalledOnce();
    expect(onColorByTypeChange).toHaveBeenCalledWith(true);
  });
});

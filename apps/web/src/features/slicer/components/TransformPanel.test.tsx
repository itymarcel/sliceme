// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransformPanel } from './TransformPanel';

afterEach(cleanup);

describe('transform parameter help', () => {
  it('provides click-to-open help for every position and rotation axis', async () => {
    const user = userEvent.setup();
    render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);

    const labels = ['Position X', 'Position Y', 'Rotation X', 'Rotation Y', 'Rotation Z'];
    labels.forEach((label) => expect(screen.getByRole('button', { name: `About ${label}` })).toBeTruthy());
    expect(document.querySelector('label button.parameter-help-trigger')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'About Rotation Z' }));
    expect(screen.getByRole('dialog', { name: 'Rotation Z information' })).toBeTruthy();
    expect(document.querySelector('.parameter-help-diagram')?.getAttribute('aria-hidden')).toBe('true');
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

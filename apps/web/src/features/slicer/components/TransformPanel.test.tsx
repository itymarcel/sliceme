// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransformPanel } from './TransformPanel';

afterEach(cleanup);

describe('transform controls', () => {
  it('keeps every axis editable without adjacent information buttons', () => {
    render(<TransformPanel position={{ x: 0, y: 0 }} rotation={{ x: 0, y: 0, z: 0 }} onPosition={vi.fn()} onRotation={vi.fn()} />);

    const labels = ['Position X', 'Position Y', 'Rotation X', 'Rotation Y', 'Rotation Z'];
    labels.forEach((label) => {
      expect(screen.getByRole('spinbutton', { name: label })).toBeTruthy();
      expect(screen.queryByRole('button', { name: `About ${label}` })).toBeNull();
    });
  });
});

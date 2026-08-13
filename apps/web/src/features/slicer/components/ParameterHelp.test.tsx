// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ParameterHelp } from './ParameterHelp';

afterEach(cleanup);

describe('parameter help positioning', () => {
  it('uses distinct illustrations for normal and first-layer height', () => {
    const { rerender } = render(<ParameterHelp label="Layer height" text="Normal layers" diagram="layers" />);
    fireEvent.click(screen.getByRole('button', { name: 'About Layer height' }), { clientX: 100, clientY: 100, detail: 1 });
    const normal = document.querySelector('.parameter-help-diagram')?.innerHTML;
    rerender(<ParameterHelp label="First layer height" text="First layer" diagram="first-layer" />);
    const first = document.querySelector('.parameter-help-diagram')?.innerHTML;
    expect(first).not.toBe(normal);
  });

  it('opens twelve pixels to the right of the pointer', () => {
    render(<ParameterHelp label="Layer height" text="Layer explanation" diagram="layers" />);
    fireEvent.click(screen.getByRole('button', { name: 'About Layer height' }), { clientX: 200, clientY: 180, detail: 1 });

    const popover = screen.getByRole('dialog', { name: 'Layer height information' }) as HTMLElement;
    expect(popover.style.left).toBe('212px');
    expect(popover.style.top).toBe('180px');
    expect(popover.dataset.anchor).toBe('pointer');
  });

  it('flips to the left when the pointer is near the right edge', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
    render(<ParameterHelp label="Support" text="Support explanation" />);
    fireEvent.click(screen.getByRole('button', { name: 'About Support' }), { clientX: 590, clientY: 100, detail: 1 });

    const popover = screen.getByRole('dialog', { name: 'Support information' }) as HTMLElement;
    expect(popover.style.left).toBe('308px');
    expect(popover.dataset.side).toBe('left');
  });

  it('uses the trigger position for keyboard activation', async () => {
    const user = userEvent.setup();
    render(<ParameterHelp label="Flow ratio" text="Flow explanation" />);
    const trigger = screen.getByRole('button', { name: 'About Flow ratio' });
    trigger.getBoundingClientRect = () => ({ x: 80, y: 40, left: 80, top: 40, right: 97, bottom: 57, width: 17, height: 17, toJSON: () => ({}) });
    trigger.focus();
    await user.keyboard('{Enter}');

    const popover = screen.getByRole('dialog', { name: 'Flow ratio information' }) as HTMLElement;
    expect(popover.style.left).toBe('109px');
    expect(popover.dataset.anchor).toBe('trigger');
  });
});

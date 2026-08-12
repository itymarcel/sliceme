// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiPrefillPanel } from './AiPrefillPanel';

afterEach(cleanup);

describe('AI settings prefill', () => {
  it('keeps the prompt client-side and submits explicitly', async () => {
    const user = userEvent.setup();
    const onDescriptionChange = vi.fn();
    const onPrefill = vi.fn();
    const { rerender } = render(<AiPrefillPanel description="" loading={false} onDescriptionChange={onDescriptionChange} onPrefill={onPrefill} />);
    expect((screen.getByRole('button', { name: 'Prefill slicer settings' }) as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByRole('textbox'), 'Strong PETG bracket');
    expect(onDescriptionChange).toHaveBeenCalled();
    rerender(<AiPrefillPanel description="Strong PETG bracket" loading={false} onDescriptionChange={onDescriptionChange} onPrefill={onPrefill} />);
    await user.click(screen.getByRole('button', { name: 'Prefill slicer settings' }));
    expect(onPrefill).toHaveBeenCalledOnce();
  });
});

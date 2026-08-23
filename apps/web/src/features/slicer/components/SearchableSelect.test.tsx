// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchableSelect } from './SearchableSelect';

afterEach(cleanup);

const options = [
  { value: 'a', label: 'Alpha One' },
  { value: 'b', label: 'Beta Two' },
  { value: 'c', label: 'Gamma Three' },
];

describe('SearchableSelect', () => {
  it('shows the placeholder when no value is selected', () => {
    render(<SearchableSelect label="Choose" value="custom" options={options} placeholder="Pick one" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Choose' }).textContent).toContain('Pick one');
  });

  it('filters options by every whitespace-separated term', async () => {
    const user = userEvent.setup();
    render(<SearchableSelect label="Choose" value="custom" options={options} onChange={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: 'Choose' }));
    await user.type(screen.getByLabelText('Choose search'), 'alpha one');
    expect(screen.getByRole('option', { name: 'Alpha One' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Beta Two' })).toBeNull();
  });

  it('calls onChange with the chosen value and collapses', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect label="Choose" value="custom" options={options} onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Choose' }));
    await user.click(screen.getByRole('option', { name: 'Beta Two' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('shows an empty state and supports keyboard navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchableSelect label="Choose" value="custom" options={options} onChange={onChange} />);
    await user.click(screen.getByRole('combobox', { name: 'Choose' }));
    await user.type(screen.getByLabelText('Choose search'), 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
    await user.clear(screen.getByLabelText('Choose search'));
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

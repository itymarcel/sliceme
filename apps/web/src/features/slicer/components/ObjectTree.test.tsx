// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ObjectTree } from './ObjectTree';

afterEach(cleanup);

const model = { fileId: 'a', fileName: 'part.stl', fileSize: 1, objectUrl: 'blob:a', file: new File(['x'], 'part.stl') };

describe('object tree tools', () => {
  it('supports additive selection, renaming, and placement warnings', () => {
    const onSelectFile = vi.fn();
    const onRename = vi.fn();
    render(<ObjectTree
      models={[model]} ranges={{}} selected={{ type: 'file', fileId: 'a' }} selectedFileIds={['a']}
      modelNames={{ a: 'Part' }} placementIssues={{ a: ['outside', 'overlap'] }}
      onSelect={vi.fn()} onSelectFile={onSelectFile} onRename={onRename}
      onAddModels={vi.fn()} onRemoveModel={vi.fn()} onAddRange={vi.fn()} onRemoveRange={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Select Part' }), { ctrlKey: true });
    expect(onSelectFile).toHaveBeenCalledWith('a', true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Object name' }), { target: { value: 'Renamed' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Object name' }));
    expect(onRename).toHaveBeenCalledWith('a', 'Renamed');
    onRename.mockClear();
    fireEvent.change(screen.getByRole('textbox', { name: 'Object name' }), { target: { value: '   ' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Object name' }));
    expect((screen.getByRole('textbox', { name: 'Object name' }) as HTMLInputElement).value).toBe('Part');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Part is outside the bed and overlaps another object');
  });
});

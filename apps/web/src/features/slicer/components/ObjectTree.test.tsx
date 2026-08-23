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
      onAddModels={vi.fn()} onAddModifier={vi.fn()} onRemoveModel={vi.fn()} onAddRange={vi.fn()} onRemoveRange={vi.fn()}
    />);
    expect(screen.queryByText('Workspace')).toBeNull();
    expect(screen.getByText('Objects')).toBeTruthy();
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

  it('nests modifier meshes under their parent and can add another modifier', () => {
    const onAddModifier = vi.fn();
    const modifier = { ...model, fileId: 'm', fileName: 'modifier.stl', modifierFor: 'a' };
    render(<ObjectTree
      models={[model, modifier]} ranges={{}} selected={{ type: 'scene' }} modelNames={{ a: 'Part', m: 'Dense zone' }}
      onSelect={vi.fn()} onSelectFile={vi.fn()} onAddModels={vi.fn()} onAddModifier={onAddModifier}
      onRemoveModel={vi.fn()} onAddRange={vi.fn()} onRemoveRange={vi.fn()}
    />);

    expect(screen.getByDisplayValue('Dense zone')).toBeTruthy();
    expect(screen.getAllByText('Modifier')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Add modifier to Part' }));
    expect(onAddModifier).toHaveBeenCalledWith('a');
  });
});

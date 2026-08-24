import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, CornerDownRight, Globe2, Layers3, Pencil, Plus, Trash2 } from 'lucide-react';

import type { RangeOverride, SelectedNode, SlicerModel } from '../types';

type Props = {
  models: SlicerModel[];
  ranges: Record<string, RangeOverride[]>;
  selected: SelectedNode;
  selectedFileIds?: string[];
  modelNames?: Record<string, string>;
  placementIssues?: Record<string, string[]>;
  onSelect: (node: SelectedNode) => void;
  onSelectFile?: (fileId: string, additive: boolean) => void;
  onRename?: (fileId: string, name: string) => void;
  onAddModels: () => void;
  onAddModifier: (fileId: string) => void;
  onRemoveModel: (fileId: string) => void;
  onAddRange: (fileId: string) => void;
  onRemoveRange: (fileId: string, rangeIndex: number) => void;
};

function ObjectName({ fileId, name, onRename }: { fileId: string; name: string; onRename?: (fileId: string, name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setValue(name), [name]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const clean = value.trim();
    if (clean && clean !== name) onRename?.(fileId, clean);
    setEditing(false);
  };
  const cancel = () => {
    setValue(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label="Object name"
        className="object-name-input"
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); commit(); }
          else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
        }}
      />
    );
  }
  return (
    <span className="object-name">
      {name}
      <button
        type="button"
        className="icon-button object-name-edit"
        aria-label="Rename object"
        title="Rename"
        onClick={(event) => { event.stopPropagation(); setEditing(true); }}
      >
        <Pencil size={13} />
      </button>
    </span>
  );
}

const placementIssueLabel = (name: string, issues: string[]) => {
  const outside = issues.includes('outside');
  const overlap = issues.includes('overlap');
  if (outside && overlap) return `${name} is outside the bed and overlaps another object`;
  if (outside) return `${name} is outside the bed`;
  return `${name} overlaps another object`;
};

const selected = (current: SelectedNode, candidate: SelectedNode) =>
  current.type === candidate.type
  && (candidate.type === 'scene' || ('fileId' in current && current.fileId === candidate.fileId))
  && (candidate.type !== 'range' || (current.type === 'range' && current.rangeIndex === candidate.rangeIndex));

export function ObjectTree(props: Props) {
  return (
    <section className="object-tree panel">
      <div className="panel-heading">
        <div><strong>Objects</strong></div>
        <div className="tree-heading-actions">
          <button className="icon-button" title="Add models" aria-label="Add models" onClick={props.onAddModels}><Plus size={15} /></button>
        </div>
      </div>
      <div className="tree-list">
        <div className="tree-line">
          <button className={`tree-row ${selected(props.selected, { type: 'scene' }) ? 'active' : ''}`} onClick={() => props.onSelect({ type: 'scene' })}>
            <Globe2 size={15} /><span>Global settings</span>
          </button>
          <span className="tree-action-spacer" />
        </div>
        {props.models.filter((model) => !model.modifierFor).map((model) => {
          const modifiers = props.models.filter((candidate) => candidate.modifierFor === model.fileId);
          const displayName = props.modelNames?.[model.fileId] ?? model.fileName;
          return (
            <div className="tree-object" key={model.fileId}>
              <div className="tree-line">
                <div className={`tree-row ${(props.selectedFileIds?.includes(model.fileId) || selected(props.selected, { type: 'file', fileId: model.fileId })) ? 'active' : ''}`}>
                  <button className="tree-select-button" type="button" aria-label={`Select ${displayName}`} onClick={(event) => props.onSelectFile?.(model.fileId, event.ctrlKey || event.metaKey || event.shiftKey) ?? props.onSelect({ type: 'file', fileId: model.fileId })}>
                    <Box size={15} />
                  </button>
                  <ObjectName fileId={model.fileId} name={displayName} onRename={props.onRename} />
                  {!!props.placementIssues?.[model.fileId]?.length && (
                    <AlertTriangle size={14} className="placement-warning" role="status" aria-label={placementIssueLabel(displayName, props.placementIssues[model.fileId])} />
                  )}
                </div>
                <button className="icon-button danger" title="Remove model" aria-label={`Remove ${displayName}`} onClick={() => props.onRemoveModel(model.fileId)}><Trash2 size={14} /></button>
              </div>
              {modifiers.map((modifier) => {
                const modifierName = props.modelNames?.[modifier.fileId] ?? modifier.fileName;
                return (
                  <div className="tree-line tree-modifier" key={modifier.fileId}>
                    <div className={`tree-row tree-child ${selected(props.selected, { type: 'file', fileId: modifier.fileId }) ? 'active' : ''}`}>
                      <button className="tree-select-button" type="button" aria-label={`Select ${modifierName}`} onClick={() => props.onSelect({ type: 'file', fileId: modifier.fileId })}>
                        <CornerDownRight className="tree-indent-arrow" size={14} /><Box size={13} />
                      </button>
                      <span className="modifier-label">Modifier</span>
                      <ObjectName fileId={modifier.fileId} name={modifierName} onRename={props.onRename} />
                    </div>
                    <button className="icon-button danger" title="Remove modifier" aria-label={`Remove ${modifierName}`} onClick={() => props.onRemoveModel(modifier.fileId)}><Trash2 size={13} /></button>
                  </div>
                );
              })}
              {(props.ranges[model.fileId] ?? []).map((range, index) => (
                <div className="tree-line" key={index}>
                  <button className={`tree-row tree-child ${selected(props.selected, { type: 'range', fileId: model.fileId, rangeIndex: index }) ? 'active' : ''}`} onClick={() => props.onSelect({ type: 'range', fileId: model.fileId, rangeIndex: index })}>
                    <CornerDownRight className="tree-indent-arrow" size={14} /><Layers3 size={14} /><span>{range.range.min_z}–{range.range.max_z} mm</span>
                  </button>
                  <button className="icon-button danger" title="Remove range" onClick={() => props.onRemoveRange(model.fileId, index)}><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="object-child-actions">
                <button className="add-range" onClick={() => props.onAddRange(model.fileId)}><Plus size={12} /> Height range</button>
                <button className="add-range" aria-label={`Add modifier to ${displayName}`} onClick={() => props.onAddModifier(model.fileId)}><Plus size={12} /> Modifier</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

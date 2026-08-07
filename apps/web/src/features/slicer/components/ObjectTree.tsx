import { Box, CornerDownRight, Globe2, Layers3, Plus, Trash2 } from 'lucide-react';

import type { RangeOverride, SelectedNode, SlicerModel } from '../types';

type Props = {
  models: SlicerModel[];
  ranges: Record<string, RangeOverride[]>;
  selected: SelectedNode;
  onSelect: (node: SelectedNode) => void;
  onAddModels: () => void;
  onRemoveModel: (fileId: string) => void;
  onAddRange: (fileId: string) => void;
  onRemoveRange: (fileId: string, rangeIndex: number) => void;
};

const selected = (current: SelectedNode, candidate: SelectedNode) =>
  current.type === candidate.type
  && (candidate.type === 'scene' || ('fileId' in current && current.fileId === candidate.fileId))
  && (candidate.type !== 'range' || (current.type === 'range' && current.rangeIndex === candidate.rangeIndex));

export function ObjectTree(props: Props) {
  return (
    <section className="object-tree panel">
      <div className="panel-heading">
        <div><span className="eyebrow">Workspace</span><strong>Objects</strong></div>
        <button className="icon-button" onClick={props.onAddModels} title="Add models"><Plus size={16} /></button>
      </div>
      <div className="tree-list">
        <div className="tree-line">
          <button className={`tree-row ${selected(props.selected, { type: 'scene' }) ? 'active' : ''}`} onClick={() => props.onSelect({ type: 'scene' })}>
            <Globe2 size={15} /><span>Global settings</span>
          </button>
          <span className="tree-action-spacer" />
        </div>
        {props.models.map((model) => (
          <div className="tree-object" key={model.fileId}>
            <div className="tree-line">
              <button className={`tree-row ${selected(props.selected, { type: 'file', fileId: model.fileId }) ? 'active' : ''}`} onClick={() => props.onSelect({ type: 'file', fileId: model.fileId })}>
                <Box size={15} /><span title={model.fileName}>{model.fileName}</span>
              </button>
              <button className="icon-button danger" title="Remove model" onClick={() => props.onRemoveModel(model.fileId)}><Trash2 size={14} /></button>
            </div>
            {(props.ranges[model.fileId] ?? []).map((range, index) => (
              <div className="tree-line" key={index}>
                <button className={`tree-row tree-child ${selected(props.selected, { type: 'range', fileId: model.fileId, rangeIndex: index }) ? 'active' : ''}`} onClick={() => props.onSelect({ type: 'range', fileId: model.fileId, rangeIndex: index })}>
                  <CornerDownRight className="tree-indent-arrow" size={14} /><Layers3 size={14} /><span>{range.range.min_z}–{range.range.max_z} mm</span>
                </button>
                <button className="icon-button danger" title="Remove range" onClick={() => props.onRemoveRange(model.fileId, index)}><Trash2 size={13} /></button>
              </div>
            ))}
            <button className="add-range" onClick={() => props.onAddRange(model.fileId)}><Plus size={12} /> Height range</button>
          </div>
        ))}
      </div>
    </section>
  );
}

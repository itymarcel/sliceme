import { useEffect, useMemo, useRef, useState } from 'react';
import { ScanSearch, Scissors, ShieldCheck } from 'lucide-react';

type Axis = 'x' | 'y' | 'z';
type Bounds = { min: Record<Axis, number>; max: Record<Axis, number> };

type Props = {
  modelName: string;
  bounds: Bounds;
  busy: boolean;
  onClose: () => void;
  onRepair: () => void | Promise<void>;
  onSplit: () => void | Promise<void>;
  onCut: (axis: Axis, offset: number) => void | Promise<void>;
};

const numeric = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function ModelToolsPopover(props: Props) {
  const root = useRef<HTMLElement>(null);
  const [axis, setAxis] = useState<Axis>('z');
  const [cutPosition, setCutPosition] = useState((props.bounds.min.z + props.bounds.max.z) / 2);
  const axisLimits = useMemo(() => ({ min: props.bounds.min[axis], max: props.bounds.max[axis] }), [axis, props.bounds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !props.busy) props.onClose(); };
    const onClick = (event: MouseEvent) => {
      if (!props.busy && root.current && !root.current.contains(event.target as Node)) props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
    };
  }, [props.busy, props.onClose]);

  return (
    <section ref={root} className="model-tools-popover panel" aria-label="Model tools">
      <header><strong>Model tools</strong><span>{props.modelName}</span></header>

      <div className="model-tool-section">
        <div><ScanSearch size={15} /><span><strong>Mesh cleanup</strong><small>Creates an undoable STL copy.</small></span></div>
        <div className="model-tool-actions">
          <button className="button secondary" type="button" disabled={props.busy} aria-label="Repair mesh" onClick={() => void props.onRepair()}><ShieldCheck size={14} /> Repair</button>
          <button className="button secondary" type="button" disabled={props.busy} aria-label="Split disconnected shells" onClick={() => void props.onSplit()}><ScanSearch size={14} /> Split shells</button>
        </div>
      </div>

      <div className="model-tool-section">
        <div><Scissors size={15} /><span><strong>Plane cut</strong><small>Creates two closed parts and keeps both.</small></span></div>
        <div className="cut-controls">
          <label>Axis<select aria-label="Cut axis" value={axis} onChange={(event) => {
            const nextAxis = event.target.value as Axis;
            setAxis(nextAxis);
            setCutPosition((props.bounds.min[nextAxis] + props.bounds.max[nextAxis]) / 2);
          }}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
          <label>Position<input aria-label="Cut position" type="number" min={axisLimits.min} max={axisLimits.max} step="0.1" value={cutPosition} onChange={(event) => setCutPosition(numeric(event.target.value))} /></label>
          <button type="button" className="button primary" disabled={props.busy || cutPosition <= axisLimits.min || cutPosition >= axisLimits.max} aria-label="Cut and keep both parts" onClick={() => void props.onCut(axis, cutPosition)}><Scissors size={14} /> Cut &amp; keep both</button>
        </div>
      </div>
    </section>
  );
}

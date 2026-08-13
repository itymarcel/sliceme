import { useEffect, useRef, useState } from 'react';
import { ListFilter } from 'lucide-react';

type Props = {
  types: string[];
  muted: string[];
  soloed: string[];
  onMutedChange: (types: string[]) => void;
  onSoloedChange: (types: string[]) => void;
};

const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export function ToolpathControls({ types, muted, soloed, onMutedChange, onSoloedChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);

  if (!types.length) return null;
  return <div className="toolpath-controls" ref={root}>
    <button className={`preview-toggle toolpath-trigger ${open ? 'active' : ''}`} type="button" aria-label="Toolpaths" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <ListFilter size={14} /><span>Toolpaths</span><strong>{soloed.length ? `${soloed.length} S` : muted.length ? `${muted.length} M` : types.length}</strong>
    </button>
    {open && <div className="toolpath-popover panel" aria-label="Toolpath visibility">
      <header><strong>Toolpaths</strong><button type="button" onClick={() => { onMutedChange([]); onSoloedChange([]); }}>Clear M/S</button></header>
      {types.map((type) => <div className="toolpath-row" key={type}>
        <span>{type}</span>
        <button type="button" className={muted.includes(type) ? 'mute active' : 'mute'} aria-pressed={muted.includes(type)} aria-label={`Mute ${type}`} onClick={() => onMutedChange(toggle(muted, type))}>M</button>
        <button type="button" className={soloed.includes(type) ? 'solo active' : 'solo'} aria-pressed={soloed.includes(type)} aria-label={`Solo ${type}`} onClick={() => onSoloedChange(toggle(soloed, type))}>S</button>
      </div>)}
    </div>}
  </div>;
}

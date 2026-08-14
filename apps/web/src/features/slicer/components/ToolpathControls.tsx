import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ListFilter } from 'lucide-react';

type Props = {
  types: string[];
  muted: string[];
  soloed: string[];
  colorByType: boolean;
  onColorByTypeChange: (enabled: boolean) => void;
  onClear: () => void;
  onMutedChange: (types: string[]) => void;
  onSoloedChange: (types: string[]) => void;
};

const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

export function ToolpathControls({ types, muted, soloed, colorByType, onColorByTypeChange, onClear, onMutedChange, onSoloedChange }: Props) {
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

  return <div className="toolpath-controls" ref={root}>
    <button className={`toolbar-button toolpath-trigger ${open || muted.length || soloed.length ? 'active' : ''}`} type="button" aria-label="Toolpaths" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <ListFilter size={14} /><span>Toolpaths</span>{(muted.length > 0 || soloed.length > 0) && <strong>{soloed.length ? `${soloed.length} S` : `${muted.length} M`}</strong>}<ChevronDown size={12} />
    </button>
    {open && <div className="toolpath-popover panel" aria-label="Toolpath visibility">
      <header><strong>Toolpaths</strong><button type="button" onClick={onClear}>Clear M/S</button></header>
      {types.map((type) => <div className="toolpath-row" key={type}>
        <span>{type}</span>
        <button type="button" className={muted.includes(type) ? 'mute active' : 'mute'} aria-pressed={muted.includes(type)} aria-label={`Mute ${type}`} onClick={() => onMutedChange(toggle(muted, type))}>M</button>
        <button type="button" className={soloed.includes(type) ? 'solo active' : 'solo'} aria-pressed={soloed.includes(type)} aria-label={`Solo ${type}`} onClick={() => onSoloedChange(toggle(soloed, type))}>S</button>
      </div>)}
      <button type="button" className="toolpath-color-toggle" aria-pressed={colorByType} aria-label={colorByType ? 'Use standard toolpath colour' : 'Use different toolpath colours'} onClick={() => onColorByTypeChange(!colorByType)}><span>Toolpath colours</span><i className="compact-toggle"><i /></i></button>
    </div>}
  </div>;
}

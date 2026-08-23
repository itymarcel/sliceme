import { useEffect, useRef, useState } from 'react';

export type SearchableOption = { value: string; label: string };

type Props = {
  id?: string;
  /** Accessible name for the trigger (e.g. "Printer profile"). */
  label: string;
  value: string;
  options: SearchableOption[];
  placeholder?: string;
  onChange: (value: string) => void;
};

export function SearchableSelect({ id, label, value, options, placeholder = 'Select…', onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value);
  const display = selected ? selected.label : placeholder;
  const listboxId = id ? `${id}-listbox` : undefined;

  const filtered = query.trim()
    ? options.filter((option) => {
      const text = option.label.toLowerCase();
      return query.trim().toLowerCase().split(/\s+/).every((term) => text.includes(term));
    })
    : options;

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(0);
      inputRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active].value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        className="searchable-select-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? '' : 'placeholder'}>{display}</span>
        <span className="searchable-select-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="searchable-select-popover" role="presentation">
          <div className="searchable-select-search">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              aria-label={`${label} search`}
              aria-controls={listboxId}
              aria-autocomplete="list"
            />
          </div>
          <ul className="searchable-select-list" id={listboxId} role="listbox" aria-label={label}>
            {filtered.length === 0 && <li className="searchable-select-empty">No matches</li>}
            {filtered.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={
                  'searchable-select-option'
                  + (index === active ? ' active' : '')
                  + (option.value === value ? ' selected' : '')
                }
                id={id ? `${id}-option-${index}` : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

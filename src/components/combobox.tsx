'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

/**
 * Searchable single-select combobox: type to filter, click or Enter to pick,
 * Escape/click-outside to close, arrow keys to navigate. Used anywhere a
 * plain <select> would get unwieldy with many options (e.g. picking a
 * player from a large roster).
 */
export function Combobox({ options, value, onChange, placeholder = 'Search…', disabled, emptyLabel = 'No matches' }: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (opt: ComboboxOption) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlight]) pick(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); inputRef.current?.blur(); }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        className="input"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : ''}
        onFocus={() => { setOpen(true); setHighlight(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-panel shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-mut">{emptyLabel}</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                  i === highlight ? 'bg-panel-2' : ''} ${o.value === value ? 'text-grass' : 'text-ink'}`}
              >
                <span className="font-medium">{o.label}</span>
                {o.sublabel && <span className="text-xs text-mut">{o.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

'use client';
/**
 * MultiStateSelect — chip-based multi-state picker.
 *
 * Usage:
 *   <MultiStateSelect
 *     states={states}          // { id, name, code }[]
 *     selected={selectedIds}   // string[]
 *     onChange={setSelectedIds}
 *   />
 */
import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, MapPin } from 'lucide-react';

export interface StateOption {
  id: string;
  name: string;
  code: string;
}

interface Props {
  states: StateOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  error?: boolean;
}

export default function MultiStateSelect({ states, selected, onChange, placeholder = 'Select states…', error }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedStates = states.filter(s => selected.includes(s.id));
  const available = states.filter(s =>
    !selected.includes(s.id) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
      setSearch('');
    }
  }

  function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(selected.filter(s => s !== id));
  }

  const borderColor = error ? '#EF4444' : open ? '#134956' : '#E2E8F0';

  return (
    <div ref={ref} className="relative">
      {/* Trigger box */}
      <div
        onClick={() => setOpen(v => !v)}
        className="min-h-[38px] w-full px-3 py-1.5 rounded-lg border bg-white cursor-pointer flex flex-wrap gap-1.5 items-center transition-colors"
        style={{ borderColor, boxShadow: open ? `0 0 0 3px rgba(19,73,86,0.08)` : undefined }}
      >
        {selectedStates.length === 0 && (
          <span className="text-sm text-[#94A3B8] select-none flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />{placeholder}
          </span>
        )}
        {selectedStates.map((s, i) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: i === 0 ? '#134956' : '#E0F2F7',
              color: i === 0 ? '#fff' : '#134956',
            }}
          >
            {i === 0 && <MapPin className="w-3 h-3" />}
            {s.name}
            <button
              onClick={e => remove(s.id, e)}
              className="ml-0.5 rounded-full hover:opacity-70 transition-opacity"
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <ChevronDown
          className="w-4 h-4 ml-auto flex-shrink-0 transition-transform"
          style={{ color: '#94A3B8', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </div>

      {/* Primary state hint */}
      {selectedStates.length > 1 && (
        <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
          <span style={{ color: '#134956', fontWeight: 600 }}>■</span> Dark chip = primary state (used for quote numbering)
        </p>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white rounded-xl border shadow-xl overflow-hidden"
          style={{ borderColor: '#E2E8F0' }}
        >
          {/* Search */}
          <div className="p-2 border-b" style={{ borderColor: '#F1F5F9' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search states…"
              className="w-full h-8 px-3 rounded-lg border text-sm placeholder:text-[#94A3B8] focus:outline-none"
              style={{ borderColor: '#E2E8F0' }}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {available.length === 0 ? (
              <div className="px-3 py-3 text-sm text-center" style={{ color: '#94A3B8' }}>
                {search ? 'No states match' : 'All states selected'}
              </div>
            ) : (
              available.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors hover:bg-[#F0F7F9]"
                >
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#134956' }} />
                  <span className="font-medium" style={{ color: '#1E293B' }}>{s.name}</span>
                  <span className="ml-auto text-xs font-mono" style={{ color: '#94A3B8' }}>{s.code}</span>
                </button>
              ))
            )}
          </div>

          {/* Selected count footer */}
          {selected.length > 0 && (
            <div
              className="px-3 py-2 border-t text-xs flex items-center justify-between"
              style={{ borderColor: '#F1F5F9', color: '#64748B' }}
            >
              <span>{selected.length} state{selected.length !== 1 ? 's' : ''} selected</span>
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-red-500 hover:text-red-700 font-medium"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

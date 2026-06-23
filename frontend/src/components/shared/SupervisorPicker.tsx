import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Supervisor } from '@/hooks/usePlacements';

/**
 * Custom supervisor dropdown — button-driven (not a native <select>) so it
 * renders reliably across browsers / iOS, matching the RegisterPage programme
 * picker. Self-contained: each instance owns its open/placement state +
 * click-outside / Escape / above-below flip. Light Nexus palette.
 *
 * - `placeholder` — button text when nothing is selected.
 * - `emptyLabel`  — when set, renders a selectable reset row (value '') at the
 *                   top of the list (e.g. "No supervisor yet"). Omit to hide it.
 * - `className`   — applied to the wrapper (e.g. width constraints).
 */
export default function SupervisorPicker({
  supervisors,
  value,
  onChange,
  placeholder = 'Select supervisor…',
  emptyLabel,
  className = '',
}: {
  supervisors: Supervisor[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen]           = useState(false);
  const [placement, setPlacement] = useState<'above' | 'below'>('below');
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  const computePlacement = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const MAX_H = 240; // matches max-h-60 (15rem)
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    setPlacement(below < MAX_H && above > below ? 'above' : 'below');
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onReposition = () => computePlacement();
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, computePlacement]);

  const selected = supervisors.find((s) => s.id === value);

  const optionClass = (isSelected: boolean) =>
    `flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors duration-100 ${
      isSelected ? 'bg-[var(--h-e5eeff)] text-[var(--h-15157d)]' : 'text-[var(--h-0b1c30)] hover:bg-[var(--h-eff4ff)]'
    }`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { if (!open) computePlacement(); setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-[var(--h-c4c5d5)] bg-[var(--h-ffffff)] px-3 py-2.5 text-left text-sm transition-colors focus:border-[var(--h-15157d)] focus:outline-none focus:ring-1 focus:ring-[var(--h-15157d)]"
      >
        <span className={selected ? 'text-[var(--h-0b1c30)]' : 'text-[var(--h-757684)]'}>
          {selected ? `${selected.firstName} ${selected.lastName}` : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--h-757684)] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute z-20 max-h-60 w-full overflow-auto rounded-lg border border-[var(--h-c4c5d5)] bg-[var(--h-ffffff)] py-1 shadow-xl ${
            placement === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {emptyLabel && (
            <li>
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className={optionClass(value === '')}>
                <span className="truncate">{emptyLabel}</span>
                {value === '' && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </li>
          )}
          {supervisors.map((s) => {
            const isSelected = s.id === value;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => { onChange(s.id); setOpen(false); }} className={optionClass(isSelected)}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.firstName} {s.lastName}</span>
                    <span className="block truncate text-xs text-[var(--h-757684)]">{s.email}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

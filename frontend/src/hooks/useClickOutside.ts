import { useEffect, useRef } from 'react';

/**
 * Calls `onOutside` when a pointer-down or Escape happens outside the returned
 * ref'd element. Used by the coordinator header dropdowns (search, bell,
 * quick-actions, account) so they close on outside click / Esc.
 */
export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOutside(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onOutside]);
  return ref;
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Users, Building2 } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { useCoordinatorSearch } from '@/hooks/useDashboard';

/**
 * Global coordinator search (item 18) — debounced typeahead across interns and
 * companies (AESIS has no separate "project" entity). Grouped results; choosing
 * one routes to the entity (intern → profile, company → companies list).
 */
export default function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const navigate = useNavigate();

  // Debounce keystrokes before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isFetching } = useCoordinatorSearch(debounced);
  const interns = data?.interns ?? [];
  const companies = data?.companies ?? [];
  const hasResults = interns.length > 0 || companies.length > 0;
  const showPanel = open && debounced.trim().length >= 2;

  const go = (to: string) => { setOpen(false); setTerm(''); navigate(to); };

  return (
    <div className="relative hidden md:block" ref={ref}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--h-757684)]" />
      <input
        type="text"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search interns or companies..."
        className="w-[360px] rounded-lg border-none bg-[var(--h-eff4ff)] py-2 pl-10 pr-9 text-sm text-[var(--h-0b1c30)] placeholder:text-[var(--h-757684)] focus:outline-none focus:ring-2 focus:ring-[var(--h-15157d-30)]"
      />
      {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--h-757684)]" />}

      {showPanel && (
        <div className="absolute left-0 z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] shadow-xl">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--h-757684)]">
              {isFetching ? 'Searching…' : `No matches for “${debounced.trim()}”.`}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {interns.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--h-757684)]">Interns</p>
                  {interns.map((i) => (
                    <button key={i.placementId} onClick={() => go(`/coordinator/interns/${i.placementId}`)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--h-eff4ff)]">
                      <Users className="h-4 w-4 shrink-0 text-[var(--h-15157d)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--h-0b1c30)]">{i.name}</span>
                        <span className="block truncate text-xs text-[var(--h-757684)]">{i.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {companies.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--h-757684)]">Companies</p>
                  {companies.map((c) => (
                    <button key={c.id} onClick={() => go('/coordinator/companies')}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--h-eff4ff)]">
                      <Building2 className="h-4 w-4 shrink-0 text-[var(--h-15157d)]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--h-0b1c30)]">{c.name}</span>
                        <span className="block truncate text-xs text-[var(--h-757684)]">{c.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

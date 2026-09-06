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
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      <input
        type="text"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search interns or companies..."
        className="w-[360px] rounded-lg border-none bg-brand-soft py-2 pl-10 pr-9 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />}

      {showPanel && (
        <div className="absolute left-0 z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          {!hasResults ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              {isFetching ? 'Searching…' : `No matches for “${debounced.trim()}”.`}
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {interns.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Interns</p>
                  {interns.map((i) => (
                    <button key={i.placementId} onClick={() => go(`/coordinator/interns/${i.placementId}`)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-brand-soft">
                      <Users className="h-4 w-4 shrink-0 text-brand-ink" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{i.name}</span>
                        <span className="block truncate text-xs text-ink-muted">{i.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {companies.length > 0 && (
                <>
                  <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Companies</p>
                  {companies.map((c) => (
                    <button key={c.id} onClick={() => go('/coordinator/companies')}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-brand-soft">
                      <Building2 className="h-4 w-4 shrink-0 text-brand-ink" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                        <span className="block truncate text-xs text-ink-muted">{c.subtitle}</span>
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

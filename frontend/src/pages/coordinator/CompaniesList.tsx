import { Link } from 'react-router-dom';
import { Building2, Loader2, Globe, Users, Inbox, ChevronRight } from 'lucide-react';
import { useCompanies } from '@/hooks/usePlacements';

/**
 * Host companies list (item 23) — the destination for the dashboard "Host
 * Companies" stat card and company search results. Read-only roster backed by
 * GET /api/v1/companies, with how many placements each currently hosts.
 */
export default function CompaniesList() {
  const { data, isLoading } = useCompanies();
  const companies = data?.companies ?? [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--h-15157d)]">Coordinator</p>
        <h2 className="text-3xl font-bold tracking-tight text-[var(--h-0b1c30)]">Host Companies</h2>
        <p className="mt-1 text-sm text-[var(--h-757684)]">Organisations hosting student placements.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" /></div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] py-16 text-center">
          <Inbox className="h-7 w-7 text-[var(--h-c4c5d5)]" />
          <p className="text-sm text-[var(--h-757684)]">No companies registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <Link
              key={c.id}
              to={`/coordinator/companies/${c.id}`}
              className="group rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-5 transition-colors hover:border-[var(--h-15157d)]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--h-e5eeff)]">
                  <Building2 className="h-5 w-5 text-[var(--h-15157d)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--h-0b1c30)]">{c.name}</p>
                  <p className="truncate text-xs text-[var(--h-757684)]">{c.industry ?? 'Host company'}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--h-c4c5d5)] transition-colors group-hover:text-[var(--h-15157d)]" />
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-[var(--h-444653)]">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-[var(--h-757684)]" />
                  {c._count?.placements ?? 0} intern{(c._count?.placements ?? 0) === 1 ? '' : 's'}
                </span>
                {c.website && (
                  <a
                    href={c.website} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--h-15157d)] hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

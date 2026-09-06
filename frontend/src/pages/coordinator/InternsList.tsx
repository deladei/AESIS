import { useSearchParams } from 'react-router-dom';
import { Users, ShieldAlert } from 'lucide-react';
import InternStatusTable from '@/components/coordinator/InternStatusTable';
import OversightPanel from '@/components/coordinator/OversightPanel';

type View = 'directory' | 'oversight';

const VIEWS: { key: View; label: string; Icon: React.ElementType }[] = [
  { key: 'directory', label: 'Directory', Icon: Users },
  { key: 'oversight', label: 'Oversight', Icon: ShieldAlert },
];

/**
 * Full, paginated interns list — the "View all N interns" destination from the
 * coordinator dashboard. Two views in one page:
 *   • Directory — the sortable/filterable placement table.
 *   • Oversight — cross-cohort at-risk monitoring (formerly its own page;
 *     /coordinator/oversight redirects here).
 * Honours `?attention=1` (dashboard "Needs Attention" deep-link, Directory) and
 * `?view=oversight`.
 */
export default function InternsList() {
  const [params, setParams] = useSearchParams();
  const attentionOnly = params.get('attention') === '1';
  const view: View = params.get('view') === 'oversight' ? 'oversight' : 'directory';

  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    if (v === 'oversight') next.set('view', 'oversight');
    else next.delete('view');
    setParams(next, { replace: true });
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-brand-ink">Coordinator</p>
          <h2 className="text-3xl font-bold tracking-tight text-ink">
            {view === 'oversight'
              ? 'Intern Oversight'
              : attentionOnly ? 'Interns needing attention' : 'All Interns'}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {view === 'oversight'
              ? 'Read-only at-risk monitoring across every active placement.'
              : 'Sort, filter, and drill into every active placement.'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {VIEWS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === key
                  ? 'bg-brand text-white'
                  : 'text-ink-muted hover:text-brand-ink'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'oversight' ? (
        <OversightPanel />
      ) : (
        <InternStatusTable pageSize={20} initialFilters={attentionOnly ? { attention: true } : undefined} />
      )}
    </div>
  );
}

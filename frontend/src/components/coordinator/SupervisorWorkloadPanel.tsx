import { Users2, Loader2, AlertTriangle, UserX } from 'lucide-react';
import { useSupervisorWorkload } from '@/hooks/useDashboard';

/**
 * Supervisor workload (item 14) — interns-per-supervisor across active placements
 * with an imbalance flag so the coordinator can rebalance. Scoped to the cohort
 * passed from the dashboard. Bars are relative to the busiest supervisor.
 */
export default function SupervisorWorkloadPanel({ scopeYearId }: { scopeYearId?: string }) {
  const { data, isLoading } = useSupervisorWorkload(scopeYearId);
  const rows = data?.rows ?? [];
  const max  = data?.summary.max ?? 0;

  return (
    <div className="rounded-card border border-line bg-surface p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Users2 className="h-5 w-5 text-brand-ink" />
          <h3 className="text-lg font-semibold text-brand-ink">Supervisor Workload</h3>
        </div>
        {data?.summary.imbalanced && (
          <span
            title={`Spread of ${data.summary.spread} interns between the busiest and quietest supervisor`}
            className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn"
          >
            <AlertTriangle className="h-3 w-3" /> Imbalanced
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand-ink" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No academic supervisors yet.</p>
      ) : (
        <>
          {data && (
            <p className="mb-4 text-xs text-ink-muted">
              {data.summary.assignedTotal} assigned across {data.summary.supervisors} supervisor
              {data.summary.supervisors === 1 ? '' : 's'} · avg {data.summary.mean.toFixed(1)} each
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.supervisor.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm font-medium text-ink" title={r.supervisor.name}>
                  {r.supervisor.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full ${r.overloaded ? 'bg-warn' : 'bg-brand'}`}
                    style={{ width: `${max > 0 ? Math.round((r.internCount / max) * 100) : 0}%` }}
                  />
                </div>
                <span className={`w-8 shrink-0 text-right text-sm font-semibold ${r.overloaded ? 'text-warn' : 'text-ink'}`}>
                  {r.internCount}
                </span>
              </li>
            ))}
          </ul>
          {data && data.unassigned > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-danger">
              <UserX className="h-4 w-4" />
              <span className="font-semibold">{data.unassigned}</span> intern{data.unassigned === 1 ? '' : 's'} with no academic supervisor
            </div>
          )}
        </>
      )}
    </div>
  );
}

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
    <div className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Users2 className="h-5 w-5 text-[var(--h-15157d)]" />
          <h3 className="text-lg font-semibold text-[var(--h-15157d)]">Supervisor Workload</h3>
        </div>
        {data?.summary.imbalanced && (
          <span
            title={`Spread of ${data.summary.spread} interns between the busiest and quietest supervisor`}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
          >
            <AlertTriangle className="h-3 w-3" /> Imbalanced
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--h-757684)]">No academic supervisors yet.</p>
      ) : (
        <>
          {data && (
            <p className="mb-4 text-xs text-[var(--h-757684)]">
              {data.summary.assignedTotal} assigned across {data.summary.supervisors} supervisor
              {data.summary.supervisors === 1 ? '' : 's'} · avg {data.summary.mean.toFixed(1)} each
            </p>
          )}
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.supervisor.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm font-medium text-[var(--h-0b1c30)]" title={r.supervisor.name}>
                  {r.supervisor.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--h-eef0f5)]">
                  <div
                    className={`h-full rounded-full ${r.overloaded ? 'bg-amber-500' : 'bg-[var(--h-15157d)]'}`}
                    style={{ width: `${max > 0 ? Math.round((r.internCount / max) * 100) : 0}%` }}
                  />
                </div>
                <span className={`w-8 shrink-0 text-right text-sm font-semibold ${r.overloaded ? 'text-amber-600' : 'text-[var(--h-0b1c30)]'}`}>
                  {r.internCount}
                </span>
              </li>
            ))}
          </ul>
          {data && data.unassigned > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t border-[var(--h-eef1ff)] pt-3 text-sm text-[var(--h-b3261e)]">
              <UserX className="h-4 w-4" />
              <span className="font-semibold">{data.unassigned}</span> intern{data.unassigned === 1 ? '' : 's'} with no academic supervisor
            </div>
          )}
        </>
      )}
    </div>
  );
}

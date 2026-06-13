import { useSearchParams } from 'react-router-dom';
import { Printer, Loader2 } from 'lucide-react';
import {
  useCoordinatorDashboard, useSupervisorWorkload, usePerformanceDistribution,
  useCoordinatorStudents, useCoordinatorCohorts,
} from '@/hooks/useDashboard';

/**
 * Printable cohort report (item 16 — PDF export). A clean, shell-less page the
 * coordinator opens in a new tab and prints / saves as PDF for department
 * records. Scoped to the cohort passed via `?academicYearId=`. No new
 * dependency — the browser's print dialog produces the PDF.
 */
export default function CohortReport() {
  const [params] = useSearchParams();
  const yearId = params.get('academicYearId') || undefined;

  const { data: dash, isLoading: l1 } = useCoordinatorDashboard(yearId);
  const { data: workload, isLoading: l2 } = useSupervisorWorkload(yearId);
  const { data: dist, isLoading: l3 } = usePerformanceDistribution(yearId);
  const { data: studentsPage, isLoading: l4 } = useCoordinatorStudents({ page: 1, limit: 500, academicYearId: yearId });
  const { data: cohorts = [] } = useCoordinatorCohorts();

  const loading = l1 || l2 || l3 || l4;
  const cohortLabel = yearId ? (cohorts.find((c) => c.id === yearId)?.label ?? 'Selected cohort') : 'All cohorts';
  const ov = dash?.overview;
  const students = studentsPage?.students ?? [];
  const generated = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  const metrics: { label: string; value: string }[] = [
    { label: 'Active interns',   value: ov ? String(ov.activePlacements) : '—' },
    { label: 'Pending placements', value: ov ? String(ov.pendingApprovals) : '—' },
    { label: 'Compliance rate',  value: ov ? `${ov.complianceRate}%` : '—' },
    { label: 'Avg performance',  value: ov?.avgPerformance != null ? ov.avgPerformance.toFixed(1) : '—' },
    { label: 'Needs attention',  value: ov ? String(ov.needsAttention) : '—' },
    { label: 'High risk',        value: ov ? String(ov.highRiskCount) : '—' },
    { label: 'Host companies',   value: ov ? String(ov.hostCompanies) : '—' },
    { label: 'Performance threshold', value: ov ? `${ov.performanceThreshold}/100` : '—' },
  ];

  return (
    <div className="mx-auto max-w-4xl bg-white p-10 text-[#0b1c30] print:p-0">
      {/* Toolbar — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-[#757684]">Use “Print” and choose “Save as PDF” to export.</p>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#15157d]" /></div>
      ) : (
        <>
          <header className="mb-8 border-b border-[#c4c5d5] pb-4">
            <h1 className="text-2xl font-bold">AESIS — Cohort Report</h1>
            <p className="mt-1 text-sm text-[#444653]">Cohort: <span className="font-semibold">{cohortLabel}</span></p>
            <p className="text-xs text-[#757684]">Generated {generated}</p>
          </header>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#757684]">Overview</h2>
            <div className="grid grid-cols-4 gap-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-[#c4c5d5]/60 p-3">
                  <p className="text-xs text-[#757684]">{m.label}</p>
                  <p className="mt-1 text-xl font-bold">{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#757684]">Supervisor workload</h2>
            {workload && workload.rows.length > 0 ? (
              <>
                <p className="mb-2 text-sm text-[#444653]">
                  {workload.summary.assignedTotal} interns across {workload.summary.supervisors} supervisor
                  {workload.summary.supervisors === 1 ? '' : 's'} · avg {workload.summary.mean.toFixed(1)} each
                  {workload.summary.imbalanced && ' · imbalanced'}
                  {workload.unassigned > 0 && ` · ${workload.unassigned} unassigned`}
                </p>
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-[#c4c5d5]/60 text-xs text-[#757684]">
                    <th className="py-1">Supervisor</th><th className="py-1 text-right">Interns</th>
                  </tr></thead>
                  <tbody>
                    {workload.rows.map((r) => (
                      <tr key={r.supervisor.id} className="border-b border-[#eef1ff]">
                        <td className="py-1">{r.supervisor.name}{r.overloaded ? ' (overloaded)' : ''}</td>
                        <td className="py-1 text-right font-semibold">{r.internCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="text-sm text-[#757684]">No supervisors.</p>}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#757684]">Performance distribution</h2>
            {dist && dist.scoredCount > 0 ? (
              <>
                <p className="mb-2 text-sm text-[#444653]">
                  {dist.scoredCount} scored · {dist.unscoredCount} not yet scorable
                  {dist.threshold > 0 && ` · ${dist.belowThreshold.length} below threshold (${dist.threshold}/100)`}
                </p>
                <div className="flex gap-4 text-sm">
                  {dist.buckets.map((b) => (
                    <div key={b.label} className="text-center">
                      <p className="font-bold">{b.count}</p>
                      <p className="text-xs text-[#757684]">{b.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-[#757684]">No logbook scores yet.</p>}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#757684]">Interns ({students.length})</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-[#c4c5d5] text-xs text-[#757684]">
                <th className="py-1">Name</th><th className="py-1">Department</th><th className="py-1">Supervisor</th>
                <th className="py-1 text-right">Progress</th><th className="py-1 text-right">Attention</th>
              </tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.placementId} className="border-b border-[#eef1ff]">
                    <td className="py-1">{s.student.firstName} {s.student.lastName}</td>
                    <td className="py-1">{s.department ?? '—'}</td>
                    <td className="py-1">{s.supervisor?.name?.trim() ? s.supervisor.name : 'Unassigned'}</td>
                    <td className="py-1 text-right">{s.progressPct}%</td>
                    <td className="py-1 text-right">{s.attention ? 'At risk' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

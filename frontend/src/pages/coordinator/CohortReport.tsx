import { useSearchParams } from 'react-router-dom';
import { Printer, Loader2 } from 'lucide-react';
import {
  useCoordinatorDashboard, useSupervisorWorkload, usePerformanceDistribution,
  useCoordinatorStudents, useCoordinatorCohorts,
} from '@/hooks/useDashboard';
import { useCohortStats, useCohortRegions } from '@/hooks/useGrade';
import { regionLabel } from '@/lib/regions';

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
  const { data: gradeStats } = useCohortStats(yearId);
  const { data: regions } = useCohortRegions(yearId);

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
    <div className="mx-auto max-w-4xl bg-surface p-10 text-ink print:p-0">
      {/* Toolbar — hidden when printing */}
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-ink-muted">Use “Print” and choose “Save as PDF” to export.</p>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-ink" /></div>
      ) : (
        <>
          <header className="mb-8 border-b border-line pb-4">
            <h1 className="text-2xl font-bold">AESIS — Cohort Report</h1>
            <p className="mt-1 text-sm text-ink-secondary">Cohort: <span className="font-semibold">{cohortLabel}</span></p>
            <p className="text-xs text-ink-muted">Generated {generated}</p>
          </header>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Overview</h2>
            <div className="grid grid-cols-4 gap-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-ink-muted">{m.label}</p>
                  <p className="mt-1 text-xl font-bold">{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Supervisor workload</h2>
            {workload && workload.rows.length > 0 ? (
              <>
                <p className="mb-2 text-sm text-ink-secondary">
                  {workload.summary.assignedTotal} interns across {workload.summary.supervisors} supervisor
                  {workload.summary.supervisors === 1 ? '' : 's'} · avg {workload.summary.mean.toFixed(1)} each
                  {workload.summary.imbalanced && ' · imbalanced'}
                  {workload.unassigned > 0 && ` · ${workload.unassigned} unassigned`}
                </p>
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-line text-xs text-ink-muted">
                    <th className="py-1">Supervisor</th><th className="py-1 text-right">Interns</th>
                  </tr></thead>
                  <tbody>
                    {workload.rows.map((r) => (
                      <tr key={r.supervisor.id} className="border-b border-line">
                        <td className="py-1">{r.supervisor.name}{r.overloaded ? ' (overloaded)' : ''}</td>
                        <td className="py-1 text-right font-semibold">{r.internCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="text-sm text-ink-muted">No supervisors.</p>}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Performance distribution</h2>
            {dist && dist.scoredCount > 0 ? (
              <>
                <p className="mb-2 text-sm text-ink-secondary">
                  {dist.scoredCount} scored · {dist.unscoredCount} not yet scorable
                  {dist.threshold > 0 && ` · ${dist.belowThreshold.length} below threshold (${dist.threshold}/100)`}
                </p>
                <div className="flex gap-4 text-sm">
                  {dist.buckets.map((b) => (
                    <div key={b.label} className="text-center">
                      <p className="font-bold">{b.count}</p>
                      <p className="text-xs text-ink-muted">{b.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-ink-muted">No logbook scores yet.</p>}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Released-grade distribution</h2>
            {gradeStats && gradeStats.count > 0 ? (
              <p className="text-sm text-ink-secondary">
                n={gradeStats.count} · mean {gradeStats.mean} · median {gradeStats.median} · pass rate {gradeStats.passRate}% ·
                Distinction {gradeStats.bands.distinction} · Pass {gradeStats.bands.pass} · Resit {gradeStats.bands.resit} · Fail {gradeStats.bands.fail}
              </p>
            ) : <p className="text-sm text-ink-muted">No grades released yet.</p>}
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Grades by region</h2>
            {regions && regions.count > 0 ? (
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-xs text-ink-muted">
                  <th className="py-1">Region</th><th className="py-1 text-right">Interns</th>
                  <th className="py-1 text-right">Avg</th><th className="py-1 text-right">Pass rate</th>
                </tr></thead>
                <tbody>
                  {regions.regions.map((r) => (
                    <tr key={r.region ?? 'unspecified'} className="border-b border-line">
                      <td className="py-1">{r.region ? regionLabel(r.region) : 'Unspecified'}</td>
                      <td className="py-1 text-right">{r.count}</td>
                      <td className="py-1 text-right font-semibold">{r.mean}</td>
                      <td className="py-1 text-right">{r.passRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-ink-muted">No released grades to roll up.</p>}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Interns ({students.length})</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line text-xs text-ink-muted">
                <th className="py-1">Name</th><th className="py-1">Department</th><th className="py-1">Supervisor</th>
                <th className="py-1 text-right">Progress</th><th className="py-1 text-right">Attention</th>
              </tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.placementId} className="border-b border-line">
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

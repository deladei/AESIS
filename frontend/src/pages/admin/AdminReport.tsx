import { Printer, Loader2 } from 'lucide-react';
import { useAdminDashboard, useEnrichmentHealth } from '@/hooks/useDashboard';
import { useCohortConfig } from '@/hooks/useCohortConfig';
import { useCohortStats, useCohortRegions } from '@/hooks/useGrade';
import { regionLabel } from '@/lib/regions';

/**
 * Printable system-wide report for admins. Shell-less so the browser print
 * dialog captures only the report (Print → Save as PDF). Pulls the same live
 * data as the dashboards — overview, the AI enrichment pipeline, released-grade
 * distribution + region rollups, the at-risk pulse board, and recent activity.
 */
export default function AdminReport() {
  const { data: dash, isLoading: l1 } = useAdminDashboard();
  const { data: enrich } = useEnrichmentHealth();
  const { data: config } = useCohortConfig();
  const yearId = config?.academicYearId;
  const { data: stats } = useCohortStats(yearId);
  const { data: regions } = useCohortRegions(yearId);

  const generated = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const ov = dash?.overview;
  const atRisk = (dash?.pulseBoard ?? []).filter((p) => p.riskTier === 'high' || p.riskTier === 'medium');

  const metrics: { label: string; value: string }[] = [
    { label: 'Active interns', value: ov ? String(ov.activeInterns) : '—' },
    { label: 'Pending reviews', value: ov ? String(ov.pendingReviews) : '—' },
    { label: 'Avg engagement', value: ov?.avgEngagement != null ? `${ov.avgEngagement}%` : '—' },
    { label: 'Submissions reviewed', value: dash ? String(dash.submissionCounts.reviewed) : '—' },
    { label: 'Submissions pending', value: dash ? String(dash.submissionCounts.pending) : '—' },
    { label: 'Tracked interns', value: dash ? String(dash.pulseBoard.length) : '—' },
  ];

  const sectionTitle = 'mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted';
  const dash100 = stats?.distribution ? Math.max(...stats.distribution, 1) : 1;

  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-ink print:p-0">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-ink-muted">Use “Print” and choose “Save as PDF” to export.</p>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      {l1 ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-brand-ink" /></div>
      ) : (
        <>
          <header className="mb-8 border-b border-line pb-4">
            <h1 className="text-2xl font-bold">AESIS — System Report</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Academic year: <span className="font-semibold">{config?.academicYearLabel ?? '—'}</span>
            </p>
            <p className="text-xs text-ink-muted">Generated {generated}</p>
          </header>

          {/* Overview */}
          <section className="mb-8">
            <h2 className={sectionTitle}>Overview</h2>
            <div className="grid grid-cols-3 gap-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-line p-3">
                  <p className="text-xs text-ink-muted">{m.label}</p>
                  <p className="mt-1 text-xl font-bold">{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* AI enrichment pipeline */}
          <section className="mb-8">
            <h2 className={sectionTitle}>AI enrichment pipeline</h2>
            {enrich ? (
              <p className="text-sm text-ink-secondary">
                {enrich.succeeded} succeeded · {enrich.pending} pending · {enrich.processing} processing ·{' '}
                <span className={enrich.failed ? 'text-danger' : ''}>{enrich.failed} failed</span> ·{' '}
                <span className={enrich.abandoned ? 'text-danger' : ''}>{enrich.abandoned} abandoned</span>{' '}
                (of {enrich.total}). {enrich.revivable > 0
                  ? `${enrich.revivable} job(s) need a re-run — advisory AI relevance is incomplete.`
                  : 'Healthy — advisory AI relevance is up to date.'}
              </p>
            ) : <p className="text-sm text-ink-muted">Pipeline status unavailable.</p>}
          </section>

          {/* Grade distribution */}
          <section className="mb-8">
            <h2 className={sectionTitle}>Released-grade distribution</h2>
            {stats && stats.count > 0 ? (
              <>
                <p className="mb-2 text-sm text-ink-secondary">
                  n={stats.count} · mean {stats.mean} · median {stats.median} · pass rate {stats.passRate}% ·
                  range {stats.min}–{stats.max}
                </p>
                <div className="mb-2 flex gap-3 text-sm">
                  <span>Distinction (≥70): <b>{stats.bands.distinction}</b></span>
                  <span>Pass (50–69): <b>{stats.bands.pass}</b></span>
                  <span>Resit (40–49): <b>{stats.bands.resit}</b></span>
                  <span>Fail (&lt;40): <b>{stats.bands.fail}</b></span>
                </div>
                <div className="flex h-20 items-end gap-1">
                  {stats.distribution.map((c, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center">
                      <div className="w-full bg-brand" style={{ height: `${(c / dash100) * 100}%` }} />
                      <span className="text-[8px] text-ink-muted">{i * 10}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-ink-muted">No grades released yet.</p>}
          </section>

          {/* Grades by region */}
          <section className="mb-8">
            <h2 className={sectionTitle}>Grades by region</h2>
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

          {/* At-risk interns */}
          <section className="mb-8">
            <h2 className={sectionTitle}>Interns needing attention ({atRisk.length})</h2>
            {atRisk.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-xs text-ink-muted">
                  <th className="py-1">Intern</th><th className="py-1">Department</th><th className="py-1">Risk</th>
                  <th className="py-1 text-right">Weeks due</th><th className="py-1 text-right">Engagement</th>
                </tr></thead>
                <tbody>
                  {atRisk.map((p) => (
                    <tr key={p.placementId} className="border-b border-line">
                      <td className="py-1">{p.name}</td>
                      <td className="py-1">{p.department ?? '—'}</td>
                      <td className="py-1 capitalize">{p.riskTier}</td>
                      <td className="py-1 text-right">{p.submittedWeeks}/{p.weeksDue}</td>
                      <td className="py-1 text-right">{p.engagementPct != null ? `${p.engagementPct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-ink-muted">No interns flagged at risk.</p>}
          </section>

          {/* Recent submissions */}
          <section>
            <h2 className={sectionTitle}>Recent submissions</h2>
            {(dash?.recentSubmissions ?? []).length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line text-xs text-ink-muted">
                  <th className="py-1">Intern</th><th className="py-1 text-right">Week</th>
                  <th className="py-1">Status</th><th className="py-1 text-right">Submitted</th>
                </tr></thead>
                <tbody>
                  {dash!.recentSubmissions.map((s) => (
                    <tr key={s.id} className="border-b border-line">
                      <td className="py-1">{s.internName}</td>
                      <td className="py-1 text-right">{s.weekNumber}</td>
                      <td className="py-1 capitalize">{s.status}</td>
                      <td className="py-1 text-right">{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-ink-muted">No recent submissions.</p>}
          </section>
        </>
      )}
    </div>
  );
}

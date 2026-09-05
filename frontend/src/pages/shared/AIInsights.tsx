import {
  Sparkles, TrendingUp, Clock, Loader2, Inbox,
} from 'lucide-react';
import { useInsights } from '@/hooks/useDashboard';

/**
 * AI Insights & Analytics — wired to GET /api/v1/insights, which aggregates the
 * ACTIVE weekly-entries pipeline (logbook entries, activity competency tags, and
 * advisory ai_assessment relevance). Supervisors see their own cohort;
 * coordinator/admin see all active placements.
 *
 * AI relevance is advisory only and is labelled as such — never a grade. Panels
 * with no source data show an honest empty state (no fabricated sample data).
 */

export default function AIInsights() {
  const { data, isLoading, isError } = useInsights();

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-712ae2)]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-[1440px] p-6 md:p-8">
        <p className="rounded-lg border border-[var(--h-ba1a1a-20)] bg-[var(--h-ffdad6-40)] p-4 text-sm text-[var(--h-ba1a1a)]">
          Couldn't load insights. Please try again.
        </p>
      </div>
    );
  }

  const { overview, performanceMonitoring, relevanceTrend, hours, skillProfile, actionableSummaries } = data;

  const trendDelta = relevanceTrend.length >= 2
    ? Math.round(relevanceTrend[relevanceTrend.length - 1].avgRelevance - relevanceTrend[0].avgRelevance)
    : null;

  const maxAvgHours = hours.weeks.reduce((m, w) => Math.max(m, w.avgHours), 0);

  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--h-15157d)]">AI Insights &amp; Analytics</h1>
        <p className="text-sm text-[var(--h-464652)]">
          {overview.activeInterns} active intern{overview.activeInterns === 1 ? '' : 's'}
          {overview.flaggedCount > 0 && <> · <span className="font-medium text-[var(--h-ba1a1a)]">{overview.flaggedCount} at risk</span></>}
          {' '}· derived from weekly logbook entries. AI relevance is advisory.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Cohort AI Relevance Trend */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[var(--h-712ae2-10)] bg-[var(--h-ffffff-70)] p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--h-712ae2)]" fill="currentColor" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--h-712ae2)]">Advisory signal</span>
              </div>
              <h3 className="text-xl font-semibold text-[var(--h-0b1c30)]">Cohort AI Relevance Trend</h3>
            </div>
            {trendDelta != null && (
              <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${trendDelta >= 0 ? 'bg-[var(--h-22c087-10)] text-[var(--h-22c087)]' : 'bg-[var(--h-ba1a1a-10)] text-[var(--h-ba1a1a)]'}`}>
                <TrendingUp className={`h-4 w-4 ${trendDelta < 0 ? 'rotate-180' : ''}`} />
                {trendDelta >= 0 ? '+' : ''}{trendDelta} pts since week 1
              </span>
            )}
          </div>
          {relevanceTrend.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--h-464652)]">No AI-enriched entries yet.</p>
          ) : (
            <div className="flex h-64 items-end justify-between gap-4 px-2">
              {relevanceTrend.map((t, i) => (
                <div key={t.week} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-lg bg-[var(--h-712ae2)] opacity-80 transition-all group-hover:opacity-100"
                      style={{ height: `${Math.max(6, t.avgRelevance)}%` }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--h-0b1c30)] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {t.avgRelevance}/100
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-[var(--h-777683)]">{i === relevanceTrend.length - 1 ? 'Latest' : `Wk ${t.week}`}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Weekly Hours Logged */}
        <section className="col-span-12 flex flex-col rounded-xl border border-[var(--h-712ae2-10)] bg-[var(--h-ffffff-70)] p-6 backdrop-blur lg:col-span-4">
          <div className="mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-[var(--h-712ae2)]" />
            <h3 className="text-xl font-semibold text-[var(--h-0b1c30)]">Weekly Hours Logged</h3>
          </div>
          {!hours.hasData ? (
            <div className="flex flex-grow flex-col items-center justify-center gap-2 py-8 text-center">
              <Inbox className="h-6 w-6 text-[var(--h-c7c5d4)]" />
              <p className="text-sm text-[var(--h-464652)]">No hours logged yet.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-grow items-end justify-between gap-2">
                {hours.weeks.map((w) => (
                  <div key={w.week} className="group flex flex-1 flex-col items-center gap-2">
                    <div className="relative flex h-40 w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-[var(--h-4edea3)] opacity-80 transition-all group-hover:opacity-100"
                        style={{ height: `${maxAvgHours > 0 ? Math.max(6, (w.avgHours / maxAvgHours) * 100) : 6}%` }}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--h-0b1c30)] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {w.avgHours}h avg
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-[var(--h-777683)]">Wk {w.week}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-[var(--h-c7c5d4-20)] pt-4 text-xs text-[var(--h-464652)]">
                Average hours logged per submitted week across the cohort.
              </p>
            </>
          )}
        </section>

        {/* Cohort Competencies */}
        <section className="col-span-12 rounded-xl border border-[var(--h-712ae2-10)] bg-[var(--h-ffffff-70)] p-6 backdrop-blur lg:col-span-7">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[var(--h-0b1c30)]">Cohort Competencies</h3>
            <span className="text-xs text-[var(--h-464652)]">From logged activity tags</span>
          </div>
          {!skillProfile.hasData ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="h-6 w-6 text-[var(--h-c7c5d4)]" />
              <p className="text-sm text-[var(--h-464652)]">No competency tags recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {skillProfile.competencies.map((c) => (
                <div key={c.tag}>
                  <div className="mb-2 flex justify-between">
                    <span className="text-sm font-medium text-[var(--h-0b1c30)]">{c.tag}</span>
                    <span className="text-xs text-[var(--h-464652)]">{c.count} {c.count === 1 ? 'activity' : 'activities'}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--h-e5eeff)]">
                    <div
                      className="h-full rounded-full bg-[var(--h-712ae2)]"
                      style={{ width: `${Math.max(4, c.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Actionable Summaries */}
        <section className="col-span-12 rounded-xl border-l-4 border-[var(--h-712ae2)] bg-[var(--h-ffffff-70)] p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--h-712ae2)]" fill="currentColor" />
            <h3 className="text-xl font-semibold text-[var(--h-0b1c30)]">Actionable Summaries</h3>
          </div>
          {actionableSummaries.hasData ? (
            <div className="space-y-4">
              {actionableSummaries.items.map((r) => (
                <div key={r.title} className="rounded-lg border border-[var(--h-712ae2-10)] bg-[var(--h-e5eeff)] p-3">
                  <h4 className="mb-1 text-sm font-medium text-[var(--h-15157d)]">{r.title}</h4>
                  <p className="text-sm text-[var(--h-464652)]">{r.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[var(--h-464652)]">
              Summaries appear once interns submit logbook entries.
            </p>
          )}
        </section>

        {/* Real-time Performance Monitoring */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[var(--h-712ae2-10)] bg-[var(--h-ffffff-70)] backdrop-blur">
          <div className="flex items-center justify-between border-b border-[var(--h-c7c5d4-20)] p-6">
            <h3 className="text-xl font-semibold text-[var(--h-0b1c30)]">Performance Monitoring</h3>
            <span className="text-xs text-[var(--h-464652)]">{performanceMonitoring.length} interns</span>
          </div>
          {performanceMonitoring.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--h-464652)]">No active interns to monitor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[var(--h-eff4ff-50)]">
                  <tr>
                    {['Intern', 'Employer', 'Engagement', 'Submissions', 'AI Relevance', 'Status'].map((h) => (
                      <th key={h} className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[var(--h-777683)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--h-c7c5d4-10)]">
                  {performanceMonitoring.map((m) => {
                    const initials = m.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
                    return (
                      <tr key={m.placementId} className="transition-colors hover:bg-[var(--h-dce9ff-30)]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-712ae2-20)] text-xs font-bold text-[var(--h-712ae2)]">{initials}</div>
                            <span className="text-sm font-medium text-[var(--h-0b1c30)]">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--h-464652)]">{m.department}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-[var(--h-e5eeff)]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${m.engagementPct ?? 0}%`, backgroundColor: m.flagged ? '#ba1a1a' : '#4edea3' }}
                              />
                            </div>
                            <span className="text-xs text-[var(--h-0b1c30)]">{m.engagementLabel}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--h-464652)]">
                          {m.submittedCount}/{m.weeksDue} due
                          <span className="block text-xs text-[var(--h-757684)]">week {m.weeksDue} of {m.programmeWeeks}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold" style={{ color: m.flagged ? '#ba1a1a' : '#15157d' }}>
                            {m.relevanceScore != null ? `${m.relevanceScore}/100` : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-tight"
                            style={m.flagged
                              ? { backgroundColor: 'rgba(255,218,214,0.4)', color: '#ba1a1a' }
                              : { backgroundColor: 'rgba(0,47,30,0.1)', color: '#22c087' }}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

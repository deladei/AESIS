import {
  Sparkles, TrendingUp, AlertTriangle, Loader2,
} from 'lucide-react';
import { useInsights } from '@/hooks/useDashboard';

/**
 * AI Insights & Analytics — wired to GET /api/v1/insights (real aggregation).
 * Supervisors see their own cohort; coordinator/admin see all active placements.
 *
 * Panels backed by real data: performance monitoring, weekly quality trend,
 * sentiment, cohort skill profile, derived summaries. Where a panel's data is
 * sparse/absent (e.g. no sentiment recorded yet), it shows a "Sample" badge and
 * illustrative content instead of an empty box.
 */

// Illustrative fallback for the sentiment heatmap when no polarity is recorded.
const SAMPLE_SENTIMENT = [40, 60, 20, 80, 30, 50, -1, 70, 40, 60, 20, 80, 30, 50];

function SampleBadge() {
  return (
    <span className="rounded-full bg-[#712ae2]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#712ae2]">
      Sample
    </span>
  );
}

function polarityColor(polarity: number) {
  // -1 → red, 0 → neutral grey, +1 → green
  if (polarity < 0) return `rgba(255,218,214,${Math.min(1, 0.3 + Math.abs(polarity))})`;
  return `rgba(78,222,163,${Math.max(0.2, polarity)})`;
}

export default function AIInsights() {
  const { data, isLoading, isError } = useInsights();

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#712ae2]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-[1440px] p-6 md:p-8">
        <p className="rounded-lg border border-[#ba1a1a]/20 bg-[#ffdad6]/40 p-4 text-sm text-[#ba1a1a]">
          Couldn't load insights. Please try again.
        </p>
      </div>
    );
  }

  const { overview, performanceMonitoring, successTrend, sentiment, skillProfile, actionableSummaries } = data;

  const trendDelta = successTrend.length >= 2
    ? Math.round(successTrend[successTrend.length - 1].avgQuality - successTrend[0].avgQuality)
    : null;

  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#15157d]">AI Insights &amp; Analytics</h1>
        <p className="text-sm text-[#464652]">
          {overview.activeInterns} active intern{overview.activeInterns === 1 ? '' : 's'}
          {overview.flaggedCount > 0 && <> · <span className="font-medium text-[#ba1a1a]">{overview.flaggedCount} flagged</span></>}
          {' '}· predictive modeling from logbook activity.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* Cohort Quality Trend */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-8">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#712ae2]">Predictive Modeling</span>
              </div>
              <h3 className="text-xl font-semibold text-[#0b1c30]">Cohort Quality Trend</h3>
            </div>
            {trendDelta != null && (
              <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${trendDelta >= 0 ? 'bg-[#22c087]/10 text-[#22c087]' : 'bg-[#ba1a1a]/10 text-[#ba1a1a]'}`}>
                <TrendingUp className={`h-4 w-4 ${trendDelta < 0 ? 'rotate-180' : ''}`} />
                {trendDelta >= 0 ? '+' : ''}{trendDelta} pts since week 1
              </span>
            )}
          </div>
          {successTrend.length === 0 ? (
            <p className="py-16 text-center text-sm text-[#464652]">No scored logbook submissions yet.</p>
          ) : (
            <div className="flex h-64 items-end justify-between gap-4 px-2">
              {successTrend.map((t, i) => (
                <div key={t.week} className="group flex flex-1 flex-col items-center gap-2">
                  <div className="relative flex h-full w-full items-end">
                    <div
                      className="w-full rounded-t-lg bg-[#712ae2] opacity-80 transition-all group-hover:opacity-100"
                      style={{ height: `${Math.max(6, t.avgQuality)}%` }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#0b1c30] px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {t.avgQuality}/100
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-[#777683]">{i === successTrend.length - 1 ? 'Latest' : `Wk ${t.week}`}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Weekly Sentiment */}
        <section className="col-span-12 flex flex-col rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 backdrop-blur lg:col-span-4">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#0b1c30]">Weekly Sentiment</h3>
            {!sentiment.hasData && <SampleBadge />}
          </div>
          <div className="grid flex-grow grid-cols-7 gap-2">
            {sentiment.hasData
              ? sentiment.weeks.map((w) => (
                  <div
                    key={w.week}
                    className="aspect-square rounded-sm"
                    style={{ backgroundColor: polarityColor(w.polarity) }}
                    title={`Week ${w.week}: ${w.polarity > 0 ? '+' : ''}${w.polarity}`}
                  />
                ))
              : SAMPLE_SENTIMENT.map((v, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-sm"
                    style={{ backgroundColor: v < 0 ? 'rgba(255,218,214,0.4)' : `rgba(78,222,163,${Math.abs(v) / 100})` }}
                  />
                ))}
          </div>
          <div className="mt-4 border-t border-[#c7c5d4]/20 pt-4">
            <div className="flex items-center gap-2 text-xs text-[#464652]">
              <AlertTriangle className={`h-4 w-4 shrink-0 ${sentiment.anomalyWeek ? 'text-[#ba1a1a]' : 'text-[#777683]'}`} />
              <span>
                {sentiment.hasData
                  ? sentiment.anomalyWeek
                    ? `Negative sentiment detected in Week ${sentiment.anomalyWeek}.`
                    : 'No sentiment anomalies detected.'
                  : 'Sentiment populates once supervisors leave feedback.'}
              </span>
            </div>
          </div>
        </section>

        {/* Cohort Skill Profile */}
        <section className="col-span-12 rounded-xl border border-[#712ae2]/10 bg-white/70 p-6 backdrop-blur lg:col-span-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-[#0b1c30]">Cohort Skill Profile</h3>
              {!skillProfile.hasData && <SampleBadge />}
            </div>
            <span className="text-xs text-[#464652]">Avg rubric score / 100</span>
          </div>
          <div className="space-y-6">
            {skillProfile.dimensions.map((s) => {
              const score = s.avgScore ?? 0;
              return (
                <div key={s.dimension}>
                  <div className="mb-2 flex justify-between">
                    <span className="text-sm font-medium text-[#0b1c30]">{s.dimension}</span>
                    <span className="text-xs text-[#464652]">{s.avgScore != null ? `${s.avgScore}/100` : 'No data'}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${score}%`, backgroundColor: score >= 70 ? '#4edea3' : score >= 50 ? '#712ae2' : '#ba1a1a' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Actionable Summaries */}
        <section className="col-span-12 rounded-xl border-l-4 border-[#712ae2] bg-white/70 p-6 shadow-[0_4px_20px_-2px_rgba(113,42,226,0.15)] backdrop-blur lg:col-span-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
            <h3 className="text-xl font-semibold text-[#0b1c30]">Actionable Summaries</h3>
          </div>
          {actionableSummaries.hasData ? (
            <div className="space-y-4">
              {actionableSummaries.items.map((r) => (
                <div key={r.title} className="rounded-lg border border-[#712ae2]/10 bg-[#e5eeff] p-3">
                  <h4 className="mb-1 text-sm font-medium text-[#15157d]">{r.title}</h4>
                  <p className="text-sm text-[#464652]">{r.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-[#464652]">
              Summaries appear once interns have scored submissions and risk scores.
            </p>
          )}
        </section>

        {/* Real-time Performance Monitoring */}
        <section className="col-span-12 overflow-hidden rounded-xl border border-[#712ae2]/10 bg-white/70 backdrop-blur">
          <div className="flex items-center justify-between border-b border-[#c7c5d4]/20 p-6">
            <h3 className="text-xl font-semibold text-[#0b1c30]">Performance Monitoring</h3>
            <span className="text-xs text-[#464652]">{performanceMonitoring.length} interns</span>
          </div>
          {performanceMonitoring.length === 0 ? (
            <p className="p-8 text-center text-sm text-[#464652]">No active interns to monitor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#eff4ff]/50">
                  <tr>
                    {['Intern', 'Employer', 'Engagement', 'Submissions', 'Success Score', 'Status'].map((h) => (
                      <th key={h} className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-[#777683]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c7c5d4]/10">
                  {performanceMonitoring.map((m) => {
                    const initials = m.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
                    return (
                      <tr key={m.placementId} className="transition-colors hover:bg-[#dce9ff]/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#712ae2]/20 text-xs font-bold text-[#712ae2]">{initials}</div>
                            <span className="text-sm font-medium text-[#0b1c30]">{m.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#464652]">{m.department}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-[#e5eeff]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${m.engagementPct}%`, backgroundColor: m.flagged ? '#ba1a1a' : '#4edea3' }}
                              />
                            </div>
                            <span className="text-xs text-[#0b1c30]">{m.engagementLabel}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#464652]">{m.submittedCount}/{m.expectedWeeks} weeks</td>
                        <td className="px-6 py-4">
                          <span className="font-bold" style={{ color: m.flagged ? '#ba1a1a' : '#15157d' }}>
                            {m.successScore != null ? `${m.successScore}/100` : '—'}
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

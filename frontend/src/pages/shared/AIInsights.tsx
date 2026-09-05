import { Link } from 'react-router-dom';
import {
  Sparkles, Users, AlertTriangle, Clock, Gauge, ArrowRight,
} from 'lucide-react';
import { useInsights } from '@/hooks/useDashboard';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar, ProgressBar, NoValue } from '@/components/ui/Bits';
import { LineTrend, RadarProfile } from '@/components/ui/Charts';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';

/**
 * AI Insights & Analytics — wired to GET /api/v1/insights, which aggregates the
 * ACTIVE weekly-entries pipeline (logbook entries, activity competency tags and
 * advisory ai_assessment relevance). Supervisors see their own cohort;
 * coordinator/admin see all active placements.
 *
 * AI relevance is advisory and is labelled as such — never a grade. The
 * reference design's anomaly detection, per-department competency heatmap and
 * copilot chat are absent: there is no anomaly model, `skillProfile` carries no
 * department dimension to plot a heatmap against, and `/ai/chat` sends the
 * caller's id as a student's. Every panel here has a real source or an honest
 * empty state.
 */
export default function AIInsights() {
  const { data, isLoading, isError, refetch } = useInsights();

  if (isLoading) return <div className="p-6"><SkeletonRows rows={6} /></div>;

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><ErrorState message="Couldn't load insights." onRetry={() => void refetch()} /></Card>
      </div>
    );
  }

  const {
    overview, performanceMonitoring, relevanceTrend, hours, skillProfile, actionableSummaries,
  } = data;

  // Latest cohort relevance, and the movement since the first charted week.
  const latestRelevance = relevanceTrend.length ? relevanceTrend[relevanceTrend.length - 1].avgRelevance : null;
  const trendDelta = relevanceTrend.length >= 2
    ? Math.round(relevanceTrend[relevanceTrend.length - 1].avgRelevance - relevanceTrend[0].avgRelevance)
    : null;

  const latestHours = hours.weeks.length ? hours.weeks[hours.weeks.length - 1].avgHours : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink">
            <Sparkles className="h-3.5 w-3.5" /> Advisory signal
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">AI Insights &amp; Analytics</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Derived from weekly logbook entries. Relevance and quality are advisory — never a grade.
          </p>
        </div>
      </header>

      {/* ── Headline figures ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active interns" value={overview.activeInterns} icon={Users} tone="brand"
          footnote="On placement now"
        />
        <StatCard
          label="Needing attention" value={overview.flaggedCount}
          icon={AlertTriangle} tone={overview.flaggedCount > 0 ? 'danger' : 'neutral'}
          footnote={overview.flaggedCount > 0 ? 'Low engagement or relevance' : 'Nobody flagged'}
        />
        <StatCard
          label="Cohort relevance"
          value={latestRelevance != null ? `${latestRelevance}/100` : <NoValue title="No enriched entries yet" />}
          icon={Gauge} tone="info" footnote="Latest charted week, advisory"
        >
          {trendDelta != null && (
            <p className={`mt-1 text-xs font-semibold ${trendDelta >= 0 ? 'text-ok' : 'text-danger'}`}>
              {trendDelta >= 0 ? '+' : ''}{trendDelta} pts since the first charted week
            </p>
          )}
        </StatCard>
        <StatCard
          label="Average hours"
          value={latestHours != null ? `${latestHours} h` : <NoValue title="No hours logged yet" />}
          icon={Clock} tone="ok" footnote="Per submitted week, latest week"
        />
      </div>

      {/* ── Trends ───────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Cohort relevance trend"
            subtitle="Mean advisory relevance per programme week"
          />
          {relevanceTrend.length === 0 ? (
            <EmptyState
              title="No enriched entries yet"
              hint="The trend fills in as submitted weeks are assessed."
              className="py-10"
            />
          ) : (
            <LineTrend
              data={relevanceTrend.map(t => ({ week: `Wk ${t.week}`, relevance: t.avgRelevance }))}
              xKey="week" yKey="relevance" yLabel="Relevance" valueSuffix="/100" height={220}
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Weekly hours logged"
            subtitle="Average hours per submitted week across the cohort"
          />
          {!hours.hasData ? (
            <EmptyState
              title="No hours logged yet"
              hint="Hours appear as interns submit weeks with attendance recorded."
              className="py-10"
            />
          ) : (
            <LineTrend
              data={hours.weeks.map(w => ({ week: `Wk ${w.week}`, hours: w.avgHours }))}
              xKey="week" yKey="hours" yLabel="Average hours" valueSuffix=" h" height={220}
            />
          )}
        </Card>
      </div>

      {/* ── Competencies + recommendations ───────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Cohort competencies"
            subtitle="Share of logged activity by competency tag"
          />
          {!skillProfile.hasData ? (
            <EmptyState
              title="No competency tags recorded yet"
              hint="Tags come from what interns log against each activity."
              className="py-10"
            />
          ) : (
            <>
              {/* A radar needs three axes to be a shape rather than a line, so
                  fewer than three falls through to the bars below it. */}
              {skillProfile.competencies.length >= 3 && (
                <RadarProfile
                  data={skillProfile.competencies.slice(0, 8).map(c => ({ axis: c.tag, value: c.pct }))}
                />
              )}
              <ul className="mt-4 space-y-3">
                {skillProfile.competencies.slice(0, 6).map(c => (
                  <li key={c.tag}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-ink">{c.tag}</span>
                      <span className="shrink-0 text-ink-muted">
                        {c.count} {c.count === 1 ? 'activity' : 'activities'} · {c.pct}%
                      </span>
                    </div>
                    <ProgressBar value={c.pct} label={`${c.tag}: ${c.pct}%`} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="What to act on"
            subtitle="Summaries derived from the cohort's own submissions"
          />
          {!actionableSummaries.hasData ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing to summarise yet"
              hint="Summaries appear once interns submit logbook entries."
              className="py-10"
            />
          ) : (
            <ul className="space-y-3">
              {actionableSummaries.items.map(r => (
                <li key={r.title} className="rounded-lg border border-line bg-surface-sunken p-3">
                  <p className="text-sm font-semibold text-ink">{r.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Performance monitoring ───────────────────────────── */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Performance monitoring</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Engagement is submitted weeks over weeks DUE, so a cohort in its third week is not behind.
            </p>
          </div>
          <span className="text-xs text-ink-muted">
            {performanceMonitoring.length} intern{performanceMonitoring.length === 1 ? '' : 's'}
          </span>
        </div>

        {performanceMonitoring.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No active interns to monitor"
            hint="Approved placements appear here as soon as they start."
            className="py-10"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken text-left text-xs font-semibold text-ink-secondary">
                  <th scope="col" className="px-5 py-3">Intern</th>
                  <th scope="col" className="px-5 py-3">Employer</th>
                  <th scope="col" className="px-5 py-3">Engagement</th>
                  <th scope="col" className="px-5 py-3">Submissions</th>
                  <th scope="col" className="px-5 py-3">AI relevance</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {performanceMonitoring.map(m => (
                  <tr key={m.placementId} className="border-b border-line last:border-0 hover:bg-surface-sunken/60">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2.5">
                        <InitialsAvatar name={m.name} size={32} />
                        <span className="truncate font-semibold text-ink">{m.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{m.department}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <ProgressBar
                          value={m.engagementPct}
                          tone={m.flagged ? 'danger' : 'ok'}
                          className="w-20"
                          label={`${m.name}: ${m.engagementLabel}`}
                        />
                        <span className="whitespace-nowrap text-xs text-ink-secondary">{m.engagementLabel}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {m.submittedCount}/{m.weeksDue} due
                      <span className="block text-xs text-ink-muted">
                        of {m.programmeWeeks} programme weeks
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {m.relevanceScore != null
                        ? <span className={`font-semibold ${m.flagged ? 'text-danger' : 'text-ink'}`}>
                            {m.relevanceScore}/100
                          </span>
                        : <NoValue title="Not assessed yet" />}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={m.flagged ? 'danger' : m.status === 'Too early' ? 'neutral' : 'ok'}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/coordinator/interns/${m.placementId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

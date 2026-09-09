import {
  Users, FileCheck2, Gauge, GraduationCap, ChevronRight, CalendarDays, Clock,
  CalendarPlus, ClipboardList, FileText, BarChart3, Activity, ArrowUpRight,
  Sparkles, TrendingUp, Landmark,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminDashboard, type AdminDashboard as AdminData } from '@/hooks/useDashboard';
import { usePlacementStats } from '@/hooks/usePlacements';
import AIEnrichmentPanel from '@/components/admin/AIEnrichmentPanel';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { DonutStat, MultiLineTrend, Sparkline } from '@/components/ui/Charts';
import { InitialsAvatar, ProgressBar, NoValue } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';

/**
 * Admin Overview.
 *
 * Rebuilt to the supplied dashboard design: greeting banner, four headline
 * cards, a six-week trend beside a states ring, the submission queue, and a
 * right rail of actions and activity.
 *
 * Where the design shows a figure this system does not hold, the panel shows
 * what it does hold rather than a placeholder. Three deliberate departures,
 * each for the same reason — the rule that no metric may render an impossible
 * state:
 *
 * - **Sparklines only where a real series exists.** The design puts one under
 *   every card. Only engagement and writing quality have a weekly series
 *   behind them; a drawn line under a headcount would be invented.
 * - **One delta, not four.** "+2 this week" is real for new placements. There
 *   is no historical series for the others, so they carry no trend arrow.
 * - **Gaps, not zeros.** A week nobody has reached is not 0% engagement and a
 *   week with no assessments did not score zero. Both come back null and the
 *   chart leaves them blank.
 */

const QUICK_ACTIONS = [
  { icon: Landmark,      label: 'Placement requests', hint: 'Registrations waiting on approval', to: '/admin/placements' },
  { icon: CalendarPlus,  label: 'Review submissions', hint: 'Weeks waiting on a decision', to: '/admin/review' },
  { icon: ClipboardList, label: 'All interns',        hint: 'Every placement and its state', to: '/admin/interns' },
  { icon: FileText,      label: 'Finalize placement', hint: 'Close out a completed intern',  to: '/admin/finalize' },
  { icon: BarChart3,     label: 'Cohort report',      hint: 'Department-wide figures',       to: '/admin/report' },
];

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  submitted:    { label: 'Pending review', tone: 'warn' },
  acknowledged: { label: 'Acknowledged',   tone: 'ok' },
  returned:     { label: 'Returned',       tone: 'danger' },
  draft:        { label: 'Draft',          tone: 'neutral' },
};

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** "2m ago" / "3h ago" / a date once it stops being recent. */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function activityLabel(a: AdminData['recentActivity'][number]): string {
  if (a.toStatus && STATUS_META[a.toStatus]) return `Week ${a.weekNumber} — ${STATUS_META[a.toStatus].label.toLowerCase()}`;
  if (a.eventType) return `Week ${a.weekNumber} — ${a.eventType.replace(/_/g, ' ')}`;
  return `Week ${a.weekNumber} updated`;
}

// ── Headline card ─────────────────────────────────────────────
//
// The design tints each card its own colour. Tone here is decoration, not
// signal — these are counts, not states — so it stays purely cosmetic and
// nothing reads meaning into it.
type Tone = 'brand' | 'ok' | 'info' | 'warn';

const TONE_STYLES: Record<Tone, { card: string; icon: string; line: string }> = {
  brand: { card: 'bg-brand-soft', icon: 'bg-brand text-white',  line: 'var(--brand)' },
  ok:    { card: 'bg-ok-soft',    icon: 'bg-ok text-white',     line: 'var(--ok)' },
  info:  { card: 'bg-info-soft',  icon: 'bg-info text-white',   line: 'var(--info)' },
  warn:  { card: 'bg-warn-soft',  icon: 'bg-warn text-white',   line: 'var(--warn)' },
};

function HeadlineCard({
  icon: Icon, label, value, caption, tone, to, series, seriesKey,
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone: Tone;
  to?: string;
  /** Omitted entirely when there is no real series — never a drawn placeholder. */
  series?: Record<string, unknown>[];
  seriesKey?: string;
}) {
  const t = TONE_STYLES[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${t.icon}`}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink-secondary">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{value}</p>
        </div>
        {to && <ChevronRight size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />}
      </div>

      {caption && <p className="mt-2 text-xs text-ink-secondary">{caption}</p>}

      {series && seriesKey && series.length >= 2 && (
        <div className="-mx-1 mt-3">
          <Sparkline data={series} yKey={seriesKey} tone={t.line} height={34} />
        </div>
      )}
    </>
  );

  const className = `rounded-card border border-line p-4 ${t.card}`;
  return to
    ? <Link to={to} className={`${className} block transition hover:shadow-card`}>{body}</Link>
    : <div className={className}>{body}</div>;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useAdminDashboard();
  // A student's registration creates a PENDING placement, and nothing on this
  // dashboard used to say so — the queue lived on the coordinator's screen,
  // which the admin rail does not link to. Read off the stats endpoint, not a
  // page of rows: a first page caps at 20 and would quietly under-count.
  const { data: placementStats, isLoading: statsLoading } = usePlacementStats();
  const pendingCount = placementStats?.pending ?? 0;
  const now = new Date();

  if (isError) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><ErrorState message="Couldn't load the dashboard." onRetry={() => void refetch()} /></Card>
      </div>
    );
  }

  const trend = data?.trend ?? [];
  const mix = data?.statusMix;
  const reviewed = mix ? mix.acknowledged : 0;
  const mixTotal = mix ? mix.draft + mix.submitted + mix.acknowledged + mix.returned : 0;
  const reviewedPct = mixTotal > 0 ? Math.round((reviewed / mixTotal) * 100) : null;

  // Only points that actually carry a series — a sparkline needs two.
  const rateSeries = trend.filter(t => t.submissionRate !== null);
  const qualitySeries = trend.filter(t => t.avgQuality !== null);

  // Movement across the window, computed here from the same points the chart
  // draws, so the sentence and the line can never disagree.
  const firstRate = rateSeries[0]?.submissionRate ?? null;
  const lastRate = rateSeries[rateSeries.length - 1]?.submissionRate ?? null;
  const rateDelta = firstRate !== null && lastRate !== null && rateSeries.length >= 2
    ? Math.round(lastRate - firstRate) : null;
  const firstQ = qualitySeries[0]?.avgQuality ?? null;
  const lastQ = qualitySeries[qualitySeries.length - 1]?.avgQuality ?? null;
  const qualityDelta = firstQ !== null && lastQ !== null && qualitySeries.length >= 2
    ? Math.round(lastQ - firstQ) : null;

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">

        {/* ── Main column ─────────────────────────────────── */}
        <div className="min-w-0 space-y-5">

          {/* Greeting banner */}
          <div className="relative overflow-hidden rounded-card bg-gradient-to-r from-brand to-info p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {greeting(now)}, {user?.firstName ?? 'Admin'} 👋
                </h1>
                <p className="mt-1 text-sm text-white/80">
                  Here's what's happening across your department today.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium">
                  <CalendarDays size={14} aria-hidden />
                  {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium">
                  <Clock size={14} aria-hidden />
                  {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>

          {/* Headline figures */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <HeadlineCard
              icon={Landmark} tone="warn" label="Placements to approve"
              to="/admin/placements"
              value={statsLoading ? '—' : pendingCount}
              caption={pendingCount === 0
                ? 'Nothing waiting'
                : `${pendingCount === 1 ? 'One registration is' : `${pendingCount} registrations are`} waiting on you`}
            />
            <HeadlineCard
              icon={Users} tone="brand" label="Active interns" to="/admin/interns"
              value={isLoading ? '—' : data?.overview.activeInterns ?? 0}
              caption={
                data && data.overview.newInternsThisWeek > 0
                  ? <span className="inline-flex items-center gap-1 text-ok">
                      <ArrowUpRight size={13} aria-hidden />
                      +{data.overview.newInternsThisWeek} this week
                    </span>
                  : 'No new placements this week'
              }
            />
            <HeadlineCard
              icon={FileCheck2} tone="ok" label="Weeks awaiting review" to="/admin/review"
              value={isLoading ? '—' : data?.overview.pendingReviews ?? 0}
              caption={
                data?.overview.pendingReviews === 0
                  ? <span className="text-ok">Queue is clear</span>
                  : `${data?.submissionCounts.reviewed ?? 0} reviewed so far`
              }
            />
            <HeadlineCard
              icon={Gauge} tone="info" label="Submission rate"
              value={isLoading ? '—' : data?.overview.avgEngagement === null || data?.overview.avgEngagement === undefined
                ? <NoValue />
                : `${data.overview.avgEngagement}%`}
              caption={
                rateDelta === null ? 'Weeks submitted out of weeks due'
                  : <span className={rateDelta >= 0 ? 'text-ok' : 'text-danger'}>
                      {rateDelta >= 0 ? '+' : ''}{rateDelta}% across the last {rateSeries.length} weeks
                    </span>
              }
              series={rateSeries} seriesKey="submissionRate"
            />
            <HeadlineCard
              icon={GraduationCap} tone="warn" label="Programmes running" to="/admin/report"
              value={isLoading ? '—' : data?.overview.activeProgrammes ?? 0}
              caption="With at least one active placement"
            />
          </div>

          {/* Trend + week states */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Cohort performance"
                subtitle="Submission rate and writing quality across all active placements."
              />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <MultiLineTrend
                  data={trend as unknown as Record<string, unknown>[]}
                  xKey="weekNumber"
                  series={[
                    { key: 'submissionRate', label: 'Submission rate', color: 'var(--brand)' },
                    { key: 'avgQuality',     label: 'Writing quality', color: 'var(--ok)' },
                  ]}
                  height={200}
                />

                {/* Key insights — every line computed from the points above, so
                    the prose and the chart cannot drift apart. Lines that
                    cannot be computed are simply absent. */}
                <div className="rounded-xl bg-surface-sunken p-4">
                  <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
                    <Sparkles size={14} className="text-brand-ink" aria-hidden />
                    Key insights
                  </p>

                  {rateDelta === null && qualityDelta === null && reviewedPct === null ? (
                    <p className="text-xs text-ink-muted">
                      Not enough submitted weeks yet to show a trend.
                    </p>
                  ) : (
                    <ul className="space-y-3 text-xs">
                      {rateDelta !== null && (
                        <li>
                          <span className="flex items-start gap-2 font-medium text-ink">
                            <TrendingUp size={13} className="mt-0.5 shrink-0 text-brand-ink" aria-hidden />
                            Submission rate {rateDelta >= 0 ? 'up' : 'down'} {Math.abs(rateDelta)}%
                          </span>
                          <span className="ml-5 text-ink-muted">
                            across weeks {rateSeries[0]?.weekNumber}–{rateSeries[rateSeries.length - 1]?.weekNumber}
                          </span>
                        </li>
                      )}
                      {qualityDelta !== null && (
                        <li>
                          <span className="flex items-start gap-2 font-medium text-ink">
                            <TrendingUp size={13} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                            Writing quality {qualityDelta >= 0 ? 'up' : 'down'} {Math.abs(qualityDelta)} points
                          </span>
                          {/* Advisory, and said so — this is not a grade. */}
                          <span className="ml-5 text-ink-muted">AI assessment, advisory only</span>
                        </li>
                      )}
                      {reviewedPct !== null && (
                        <li>
                          <span className="flex items-start gap-2 font-medium text-ink">
                            <FileCheck2 size={13} className="mt-0.5 shrink-0 text-info" aria-hidden />
                            {reviewedPct}% of weeks acknowledged
                          </span>
                          <span className="ml-5 text-ink-muted">{reviewed} of {mixTotal} logged weeks</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Week states" subtitle="Every logged week across active placements." />
              {mixTotal === 0 ? (
                <EmptyState title="Nothing logged yet" hint="This fills in as interns submit weeks." />
              ) : (
                <DonutStat
                  size={170}
                  centerValue={`${reviewedPct}%`}
                  centerCaption="Acknowledged"
                  data={[
                    { label: 'Acknowledged',   value: mix!.acknowledged, color: 'var(--ok)' },
                    { label: 'Pending review', value: mix!.submitted,    color: 'var(--warn)' },
                    { label: 'Returned',       value: mix!.returned,     color: 'var(--danger)' },
                    { label: 'Draft',          value: mix!.draft,        color: 'var(--chart-grid)' },
                  ].filter(s => s.value > 0)}
                />
              )}
            </Card>
          </div>

          {/* Recent submissions */}
          <Card>
            <CardHeader
              title="Recent submissions"
              subtitle="Latest logbook weeks sent for review."
              action={{ label: 'View all', to: '/admin/review' }}
            />
            {isLoading ? (
              <SkeletonRows rows={4} />
            ) : !data?.recentSubmissions.length ? (
              <EmptyState title="No submissions yet" hint="Weeks appear here as interns submit them." />
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-semibold text-ink-secondary">
                      <th className="px-3 pb-2">Intern</th>
                      <th className="px-3 pb-2">Week</th>
                      <th className="px-3 pb-2">Submitted</th>
                      <th className="px-3 pb-2">Status</th>
                      <th className="px-3 pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentSubmissions.map((s) => {
                      const meta = STATUS_META[s.status] ?? { label: s.status, tone: 'neutral' as BadgeTone };
                      return (
                        <tr key={s.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2.5">
                              <InitialsAvatar name={s.internName} size={30} />
                              <span className="font-medium text-ink">{s.internName}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-ink-secondary">Week {s.weekNumber}</td>
                          <td className="px-3 py-3 text-ink-secondary">{formatDate(s.submittedAt)}</td>
                          <td className="px-3 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              to="/admin/review"
                              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-sunken"
                            >
                              Review <ChevronRight size={13} aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Progress by programme */}
          <Card>
            <CardHeader
              title="Progress by programme"
              subtitle="Weeks submitted against weeks due so far."
            />
            {!data?.programmeProgress.length ? (
              <EmptyState
                title="Nothing due yet"
                hint="Programmes appear once their first week comes due."
              />
            ) : (
              <div className="grid gap-5 sm:grid-cols-[170px_minmax(0,1fr)]">
                <div className="grid place-items-center">
                  <DonutStat
                    size={140}
                    legend={false}
                    centerValue={data.overview.avgEngagement === null ? <NoValue /> : `${data.overview.avgEngagement}%`}
                    centerCaption="Overall"
                    data={[
                      { label: 'Submitted', value: data.overview.avgEngagement ?? 0, color: 'var(--ok)' },
                      { label: 'Outstanding', value: 100 - (data.overview.avgEngagement ?? 0), color: 'var(--chart-grid)' },
                    ]}
                  />
                </div>
                <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {data.programmeProgress.map((p) => (
                    <li key={p.programme}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-ink">{p.programme}</span>
                        <span className="shrink-0 font-mono text-ink-secondary">{p.pct}%</span>
                      </div>
                      <ProgressBar value={p.pct} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* ── Right rail ──────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Quick actions" subtitle="Jump straight to the work." />
            <ul className="space-y-2">
              {QUICK_ACTIONS.map(({ icon: Icon, label, hint, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:bg-surface-sunken"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{label}</span>
                      <span className="block truncate text-xs text-ink-muted">{hint}</span>
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-ink-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Recent activity" subtitle="Straight off the audit log." />
            {isLoading ? (
              <SkeletonRows rows={4} />
            ) : !data?.recentActivity.length ? (
              <EmptyState title="Nothing yet" hint="Every logbook transition is recorded here." />
            ) : (
              <ul className="space-y-3">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-secondary">
                      <Activity size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{activityLabel(a)}</span>
                      <span className="block truncate text-xs text-ink-muted">{a.actorName}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">{ago(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Enrichment health — the design's "AI assistant" slot, carrying the
              one AI thing an admin actually acts on. */}
          <AIEnrichmentPanel />
        </div>
      </div>
    </div>
  );
}

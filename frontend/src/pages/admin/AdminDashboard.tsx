import {
  Activity, CheckCircle2, MessageCircle, Sparkles, AlertTriangle, CalendarClock,
  Zap, ArrowUpCircle, Users, FileCheck2, Gauge,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminDashboard, type AdminDashboard as AdminData } from '@/hooks/useDashboard';
import AIEnrichmentPanel from '@/components/admin/AIEnrichmentPanel';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { InitialsAvatar, ProgressBar, NoValue } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';

/**
 * Admin Overview — Pulse Check Board, advisory risk alerts, enrichment health
 * and the recent-submission queue. Live data via GET /api/v1/admin/dashboard.
 *
 * This was the one dashboard S93 missed: it kept hand-rolled cards, legacy
 * `--h-*` vars, and raw Tailwind palette shades — none of which respond to the
 * theme. Everything here now comes from the shared kit, so it matches the other
 * two dashboards and works in dark mode.
 */

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

type Pulse = AdminData['pulseBoard'][number];

/** The badge on a pulse card. Tone is the signal, never decoration. */
function pulseBadge(p: Pulse, isTop: boolean): { label: string; tone: BadgeTone } {
  if (isTop && p.riskTier !== 'high' && (p.engagementPct ?? 0) >= 80) {
    return { label: 'Top performer', tone: 'ok' };
  }
  if (p.riskTier === 'high')   return { label: 'Needs support', tone: 'danger' };
  if (p.riskTier === 'medium') return { label: 'Watch',         tone: 'warn' };
  return { label: 'On track', tone: 'brand' };
}

// Entry-pipeline statuses — the dashboard's recent rows are logbook entries.
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  submitted:    { label: 'Pending review', tone: 'warn' },
  acknowledged: { label: 'Acknowledged',   tone: 'ok' },
  returned:     { label: 'Returned',       tone: 'danger' },
  draft:        { label: 'Draft',          tone: 'neutral' },
};

export default function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useAdminDashboard();

  if (isError) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><ErrorState message="Couldn't load the dashboard." onRetry={() => void refetch()} /></Card>
      </div>
    );
  }

  const alerts = data?.riskAlerts ?? [];
  const pulse = data?.pulseBoard ?? [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Admin Overview</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {data
            ? `Monitoring ${data.overview.activeInterns} active internship${data.overview.activeInterns === 1 ? '' : 's'} across all departments.`
            : 'Monitoring active internships across all departments.'}
        </p>
      </header>

      {/* ── Headline figures ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active interns" value={data?.overview.activeInterns ?? 0}
          icon={Users} tone="brand" loading={isLoading}
          footnote="On placement now"
        />
        <StatCard
          label="Pending reviews" value={data?.overview.pendingReviews ?? 0}
          icon={FileCheck2} tone="warn" loading={isLoading}
          footnote="Weeks awaiting a supervisor's decision"
          action={{ label: 'Open the queue', to: '/admin/review' }}
        />
        <StatCard
          label="Average pulse"
          value={data?.overview.avgEngagement != null
            ? `${data.overview.avgEngagement}%`
            : <NoValue title="No week has come due yet" />}
          icon={Gauge} tone="ok" loading={isLoading}
          footnote="Weeks submitted over weeks due"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ── Pulse Check Board ──────────────────────────────── */}
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-ok" /> Pulse Check Board</span>}
            subtitle="Engagement per intern — submitted weeks against weeks due"
            action={{ label: 'Detailed metrics', to: '/ai-insights' }}
          />

          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : pulse.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No active interns yet"
              hint="Each intern's weekly engagement appears here once a placement is active."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pulse.map((p, i) => {
                const badge = pulseBadge(p, i === 0);
                return (
                  <div key={p.placementId} className="rounded-card border border-line bg-surface-sunken p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <InitialsAvatar name={p.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                          <p className="truncate text-xs text-ink-muted">{p.department ?? 'Unassigned department'}</p>
                        </div>
                      </div>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>

                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">Weekly engagement</span>
                      <span className="font-semibold text-ink">
                        {p.engagementPct != null ? `${p.engagementPct}%` : '—'}
                      </span>
                    </div>
                    <ProgressBar
                      value={p.engagementPct}
                      tone={badge.tone === 'danger' ? 'danger' : badge.tone === 'warn' ? 'warn' : badge.tone === 'ok' ? 'ok' : 'brand'}
                      label={`${p.name}: ${p.engagementPct ?? 0}% engagement`}
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {p.submittedWeeks}/{p.weeksDue} weeks due
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" /> {p.feedbackCount} feedback
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Advisory alerts ────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-ink" /> Advisory alerts</span>}
              subtitle="Risk signals — never part of a grade"
            />

            {isLoading ? (
              <SkeletonRows rows={3} />
            ) : alerts.length > 0 ? (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" /> Urgent support needed
                </p>
                <p className="text-sm leading-relaxed text-ink">
                  <span className="font-semibold">{alerts[0].name}</span> is flagged{' '}
                  <span className="font-semibold text-danger">high risk</span>.
                  {alerts.length > 1
                    ? ` ${alerts.length - 1} other intern${alerts.length - 1 === 1 ? '' : 's'} also need attention.`
                    : ''}
                </p>
                {alerts[0].factors.length > 0 && (
                  <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger">
                    {alerts[0].factors.join(' · ')}
                  </p>
                )}
                {/* Real destination — the Feedback Centre chats and schedules calls. */}
                <Link
                  to="/feedback"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
                >
                  <CalendarClock className="h-4 w-4" /> Schedule a check-in
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-semibold text-ok">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All clear
                </p>
                <p className="text-sm text-ink-secondary">No interns are currently flagged high risk.</p>
              </div>
            )}
          </Card>

          {pulse.length > 0 && pulse[0].engagementPct != null && (
            <Card>
              <CardHeader
                title={<span className="flex items-center gap-2"><Zap className="h-4 w-4 text-ok" /> Leading the cohort</span>}
              />
              <p className="text-sm leading-relaxed text-ink">
                <span className="font-semibold">{pulse[0].name}</span> has the highest engagement at{' '}
                {pulse[0].engagementPct}% ({pulse[0].submittedWeeks} of {pulse[0].weeksDue} weeks due).
              </p>
              <Link
                to="/feedback"
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line py-2 text-sm font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
              >
                <ArrowUpCircle className="h-4 w-4" /> Message this intern
              </Link>
            </Card>
          )}
        </div>
      </div>

      {/* AI enrichment pipeline health + manual revive */}
      <AIEnrichmentPanel />

      {/* ── Recent submissions ───────────────────────────────── */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Recent submissions</h2>
            <p className="mt-0.5 text-xs text-ink-muted">Newest weeks handed in across the cohort</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Badge tone="warn">{data?.submissionCounts.pending ?? 0} pending</Badge>
            <Badge tone="neutral">{data?.submissionCounts.reviewed ?? 0} reviewed</Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="p-5"><SkeletonRows rows={4} /></div>
        ) : (data?.recentSubmissions.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="No submissions yet"
            hint="Weeks appear here the moment an intern hands one in."
            className="py-10"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-surface-sunken">
                  <tr className="text-xs font-semibold text-ink-secondary">
                    <th scope="col" className="px-5 py-3">Intern</th>
                    <th scope="col" className="px-5 py-3">Week</th>
                    <th scope="col" className="px-5 py-3">Submitted</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data?.recentSubmissions.map((s) => {
                    const status = STATUS_META[s.status] ?? { label: s.status, tone: 'neutral' as BadgeTone };
                    const isPending = s.status === 'submitted';
                    return (
                      <tr key={s.id} className="transition-colors hover:bg-surface-sunken">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <InitialsAvatar name={s.internName} />
                            <span className="text-sm text-ink">{s.internName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-ink">Week {s.weekNumber}</td>
                        <td className="px-5 py-3 text-ink-muted">{formatDate(s.submittedAt)}</td>
                        <td className="px-5 py-3"><Badge tone={status.tone}>{status.label}</Badge></td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            to={`/admin/review?entryId=${s.id}`}
                            className={isPending
                              ? 'inline-block rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover'
                              : 'inline-block rounded-lg border border-line px-4 py-1.5 text-sm font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink'}
                          >
                            {isPending ? 'Review' : 'View'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center border-t border-line bg-surface-sunken p-3">
              <Link to="/admin/review" className="text-sm font-semibold text-brand-ink hover:underline">
                View all submissions
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

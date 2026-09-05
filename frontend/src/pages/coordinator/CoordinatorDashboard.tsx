import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Briefcase, Check, Clock, Eye, FileDown, Inbox,
  Landmark, Loader2, RefreshCw, Users, X,
} from 'lucide-react';
import { useCoordinatorDashboard, useCoordinatorActivity, useCoordinatorCohorts, type CoordinatorActivity } from '@/hooks/useDashboard';
import { useAllPlacements, useUpdatePlacementStatus } from '@/hooks/usePlacements';
import { useCohortConfig } from '@/hooks/useCohortConfig';
import InternStatusTable from '@/components/coordinator/InternStatusTable';
import SupervisorWorkloadPanel from '@/components/coordinator/SupervisorWorkloadPanel';
import PerformanceDistributionModal from '@/components/coordinator/PerformanceDistributionModal';
import GradeDistributionPanel from '@/components/coordinator/GradeDistributionPanel';
import RegionRollupPanel from '@/components/coordinator/RegionRollupPanel';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { NoValue, ProgressBar } from '@/components/ui/Bits';
import { DonutStat, MultiLineTrend } from '@/components/ui/Charts';

/**
 * Coordinator dashboard.
 *
 * Backed by /coordinator/dashboard (metrics, risk mix, submission trend),
 * /coordinator/students (intern table), /coordinator/activity (audit feed) and
 * /placements?status=pending (approval queue).
 *
 * The previous version carried an "AI Pulse Matching" panel listing named
 * students with match percentages — those names and numbers were hardcoded in
 * the component. It has been removed rather than restyled: there is no matching
 * engine behind it, and a panel that invents student names is worse than an
 * absent one. Matching arrives with the opportunities/applications work, which
 * has real schema behind it.
 */

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Recent-activity rows deep-link to their source entity when we have a route
// for it. Placement audit rows open the intern profile.
function activityLink(a: CoordinatorActivity): string | null {
  if (a.entityType === 'placement' && a.entityId) return `/coordinator/interns/${a.entityId}`;
  return null;
}

export default function CoordinatorDashboard() {
  // Cohort scope — '' means the whole active population. Scopes every metric,
  // the workload panel, the distribution, the intern table and the exports.
  const [yearId, setYearId] = useState('');
  const scopeYearId = yearId || undefined;
  const [showDistribution, setShowDistribution] = useState(false);

  // Inline placement approve/reject. Reject expands a reason field.
  const updateStatus = useUpdatePlacementStatus();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const approve = (id: string) => updateStatus.mutate({ id, status: 'active' });
  const confirmReject = (id: string) => {
    const reason = rejectReason.trim();
    if (!reason) return;
    updateStatus.mutate({ id, status: 'rejected', rejectionReason: reason },
      { onSuccess: () => { setRejectingId(null); setRejectReason(''); } });
  };

  const { data: dash, isLoading: dashLoading, isError: dashError, refetch: refetchDash } = useCoordinatorDashboard(scopeYearId);
  const { data: pending } = useAllPlacements(1, 'pending');
  const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useCoordinatorActivity(8);
  const { data: cohorts = [] } = useCoordinatorCohorts();
  const { data: cohortConfig } = useCohortConfig();
  const statsYearId = scopeYearId ?? cohortConfig?.academicYearId;

  const pendingList = pending?.placements ?? [];
  const ov = dash?.overview;

  if (dashError) {
    return (
      <div className="p-6">
        <Card>
          <ErrorState message="Couldn't load the coordinator dashboard." onRetry={() => refetchDash()} />
        </Card>
      </div>
    );
  }

  const risk = dash?.riskDistribution ?? { low: 0, medium: 0, high: 0 };
  const riskDonut = [
    { label: 'On track', value: risk.low,    color: 'var(--chart-1)' },
    { label: 'At risk',  value: risk.medium, color: 'var(--chart-2)' },
    { label: 'Behind',   value: risk.high,   color: 'var(--chart-4)' },
  ].filter((s) => s.value > 0);
  const riskTotal = risk.low + risk.medium + risk.high;

  const trend = dash?.submissionTrends ?? [];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Cohort oversight</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Placement approvals, intern progress and supervisor load across the cohort.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            aria-label="Scope dashboard to a cohort"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.label}{c.isActive ? ' (active)' : ''}</option>
            ))}
          </select>

          <a
            href={`/coordinator/report${scopeYearId ? `?academicYearId=${scopeYearId}` : ''}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken"
          >
            <FileDown className="h-4 w-4" /> Export PDF
          </a>

          <Link
            to="/coordinator/assignments"
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Manage assignments
          </Link>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active interns"
          value={ov ? ov.activePlacements.toLocaleString() : <NoValue />}
          icon={Users}
          tone="brand"
          loading={dashLoading}
          footnote="Currently on placement"
          action={{ label: 'View all interns', to: '/coordinator/interns' }}
        />
        <StatCard
          label="Pending placements"
          value={ov ? ov.pendingApprovals : <NoValue />}
          icon={Clock}
          tone={ov?.pendingApprovals ? 'warn' : 'ok'}
          loading={dashLoading}
          footnote={ov?.pendingApprovals ? 'Awaiting your review' : 'All caught up'}
          action={{ label: 'Review placements', to: '/coordinator/placements' }}
        />
        <StatCard
          label="Needs attention"
          value={ov ? ov.needsAttention : <NoValue />}
          icon={AlertTriangle}
          tone={ov?.needsAttention ? 'danger' : 'ok'}
          loading={dashLoading}
          footnote={ov?.needsAttention ? 'Flagged for review' : 'None flagged'}
          action={{ label: 'See flagged interns', to: '/coordinator/interns?attention=1' }}
        />
        <StatCard
          label="Host companies"
          value={ov ? ov.hostCompanies : <NoValue />}
          icon={Briefcase}
          tone="info"
          loading={dashLoading}
          footnote="Currently hosting interns"
          action={{ label: 'View companies', to: '/coordinator/companies' }}
        />
      </div>

      {/* Trend + risk mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Submissions against schedule"
            subtitle="Weeks scheduled versus weeks actually submitted, cohort-wide"
          />
          <MultiLineTrend
            data={trend as unknown as Record<string, unknown>[]}
            xKey="week"
            series={[
              { key: 'scheduled', label: 'Scheduled', color: 'var(--chart-line)' },
              { key: 'submitted', label: 'Submitted', color: 'var(--chart-1)' },
            ]}
          />
        </Card>

        <Card>
          <CardHeader
            title="Risk mix"
            subtitle="Rule-based tiers — advisory, never a grade"
            control={
              <button
                type="button"
                onClick={() => setShowDistribution(true)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-secondary hover:bg-surface-sunken"
              >
                <BarChart3 className="mr-1 inline h-3.5 w-3.5" />
                Performance
              </button>
            }
          />
          <DonutStat
            data={riskDonut}
            centerValue={riskTotal}
            centerCaption={riskTotal === 1 ? 'intern' : 'interns'}
            emptyHint="Risk tiers appear once interns begin submitting."
          />
          {ov?.avgPerformance != null && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-secondary">Average performance</span>
                <span className="font-semibold text-ink">{ov.avgPerformance.toFixed(1)}</span>
              </div>
              <ProgressBar value={ov.avgPerformance} className="mt-2" label="Average cohort performance" />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-8">
          <InternStatusTable pageSize={8} viewAllHref="/coordinator/interns" scopeYearId={scopeYearId} />
          <SupervisorWorkloadPanel scopeYearId={scopeYearId} />
          <GradeDistributionPanel academicYearId={statsYearId} />
          <RegionRollupPanel academicYearId={statsYearId} />

          {/* Placement approvals */}
          <Card>
            <CardHeader
              title="Placement requests"
              subtitle="Awaiting your approval"
              control={pendingList.length > 0 ? <Badge tone="brand">{pendingList.length} new</Badge> : undefined}
            />
            {pendingList.length === 0 ? (
              <EmptyState icon={Inbox} title="No pending requests" hint="New placement submissions land here for approval." />
            ) : (
              <div className="space-y-3">
                {pendingList.slice(0, 4).map((p) => {
                  const studentName = p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown student';
                  const busy = updateStatus.isPending && updateStatus.variables?.id === p.id;
                  return (
                    <div key={p.id} className="rounded-xl border border-line p-3 transition-colors hover:border-line-strong">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                            <Landmark className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{p.company?.name ?? 'Unassigned company'}</p>
                            <p className="truncate text-xs text-ink-muted">{studentName}</p>
                          </div>
                        </div>

                        {rejectingId !== p.id && (
                          <div className="flex shrink-0 gap-2">
                            <Link
                              to="/coordinator/placements"
                              aria-label={`Review ${studentName}'s placement`}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-secondary transition-colors hover:bg-surface-sunken"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => { setRejectingId(p.id); setRejectReason(''); }}
                              disabled={busy}
                              aria-label={`Reject ${studentName}'s placement`}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => approve(p.id)}
                              disabled={busy}
                              aria-label={`Approve ${studentName}'s placement`}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                      </div>

                      {rejectingId === p.id && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            autoFocus
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection…"
                            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
                            onKeyDown={(e) => { if (e.key === 'Enter') confirmReject(p.id); }}
                          />
                          <button
                            onClick={() => confirmReject(p.id)}
                            disabled={!rejectReason.trim() || busy}
                            className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reject'}
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(''); }}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Activity */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="flex h-full flex-col" padded={false}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
              <button
                onClick={() => refetchActivity()}
                aria-label="Refresh activity"
                className="text-ink-muted transition-colors hover:text-ink"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {activityLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
              ) : !activity || activity.length === 0 ? (
                <EmptyState icon={Inbox} title="No recent activity" hint="Approvals and assignments show up here." />
              ) : activity.map((a) => {
                const link = activityLink(a);
                const body = (
                  <p className="text-sm text-ink">
                    <strong className="font-semibold">{a.actor}</strong> · {a.summary}
                  </p>
                );
                return (
                  <div key={a.id} className="relative border-l border-line pl-5">
                    <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-surface" />
                    <p className="mb-1 text-xs font-medium text-ink-muted">{relativeTime(a.createdAt)}</p>
                    {link ? (
                      <Link to={link} className="block rounded-lg bg-surface-sunken p-3 transition-colors hover:bg-brand-soft">
                        {body}
                      </Link>
                    ) : (
                      <div className="rounded-lg bg-surface-sunken p-3">{body}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-line p-4">
              <Link
                to="/coordinator/placements"
                className="block w-full rounded-xl border border-line py-2 text-center text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                View placements
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {showDistribution && (
        <PerformanceDistributionModal scopeYearId={scopeYearId} onClose={() => setShowDistribution(false)} />
      )}
    </div>
  );
}

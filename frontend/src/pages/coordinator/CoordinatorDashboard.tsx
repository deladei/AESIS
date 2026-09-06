import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Briefcase, Building2, CalendarClock, Check, ChevronRight,
  Clock, Eye, FileDown, FileText, GraduationCap, Inbox, Landmark, Loader2, RefreshCw,
  Sparkles, TrendingUp, X,
} from 'lucide-react';
import { useCoordinatorDashboard, useCoordinatorActivity, useCoordinatorCohorts, type CoordinatorActivity } from '@/hooks/useDashboard';
import { useAllPlacements, useUpdatePlacementStatus } from '@/hooks/usePlacements';
import { useCohortConfig } from '@/hooks/useCohortConfig';
import { useApplications } from '@/hooks/useOpportunities';
import InternStatusTable from '@/components/coordinator/InternStatusTable';
import SupervisorWorkloadPanel from '@/components/coordinator/SupervisorWorkloadPanel';
import PerformanceDistributionModal from '@/components/coordinator/PerformanceDistributionModal';
import GradeDistributionPanel from '@/components/coordinator/GradeDistributionPanel';
import RegionRollupPanel from '@/components/coordinator/RegionRollupPanel';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard, DeltaChip } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { DateTile, InitialsAvatar, NoValue, ProgressBar } from '@/components/ui/Bits';
import { DonutStat, MultiLineTrend } from '@/components/ui/Charts';

/**
 * Coordinator dashboard, laid out to the reference design: four headline
 * figures, then Application Overview / Internship Status / Insights, then
 * Recent Applications / Upcoming Deadlines / Placement Rate, then the intern
 * table and the partner-company row.
 *
 * Two things the reference shows are deliberately not reproduced. Its
 * "Placement Prediction 87%" gauge is a forecast with no labelled outcome data
 * behind it — replaced here by the measured placement rate. Its inline chat box
 * is absent because /ai/chat hardcodes a student id, so pointing a coordinator
 * at it would send their id as a student's; the insight cards link out instead.
 */

const APPLICATION_TONE: Record<string, 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'done'> = {
  pending:      'neutral',
  under_review: 'info',
  shortlisted:  'brand',
  offered:      'done',
  accepted:     'ok',
  rejected:     'danger',
  withdrawn:    'neutral',
};

function daysLeft(iso: string | null): string {
  if (!iso) return 'No closing date';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

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

// Recent-activity rows deep-link to their source entity when a route exists.
function activityLink(a: CoordinatorActivity): string | null {
  if (a.entityType === 'placement' && a.entityId) return `/coordinator/interns/${a.entityId}`;
  return null;
}

export default function CoordinatorDashboard() {
  const [yearId, setYearId] = useState('');
  const scopeYearId = yearId || undefined;
  const [showDistribution, setShowDistribution] = useState(false);

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
  const { data: applications = [] } = useApplications(undefined, 5);
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

  const sd = dash?.statusDistribution ?? { pending: 0, active: 0, completed: 0, cancelled: 0 };
  const statusTotal = dash?.statusTotal ?? 0;
  const statusDonut = [
    { label: 'Open',        value: sd.pending,   color: 'var(--chart-1)' },
    { label: 'In Progress', value: sd.active,    color: 'var(--chart-2)' },
    { label: 'Completed',   value: sd.completed, color: 'var(--chart-3)' },
    { label: 'Cancelled',   value: sd.cancelled, color: 'var(--chart-4)' },
  ].filter((d) => d.value > 0);
  const inProgressShare = statusTotal > 0 ? Math.round((sd.active / statusTotal) * 100) : 0;

  const appTrend = dash?.applicationTrend ?? [];
  const risk = dash?.riskDistribution ?? { low: 0, medium: 0, high: 0 };
  const topDept = dash?.partnerCompanies?.[0] ?? null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Placements, applications and cohort progress at a glance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            aria-label="Scope dashboard to a cohort"
            className="rounded-card border border-line bg-surface px-3 py-2 text-sm font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>{c.label}{c.isActive ? ' (active)' : ''}</option>
            ))}
          </select>

          <a
            href={`/coordinator/report${scopeYearId ? `?academicYearId=${scopeYearId}` : ''}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-card border border-line px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken"
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

      {/* Four headline figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={ov ? ov.totalStudents.toLocaleString() : <NoValue />}
          icon={GraduationCap}
          tone="brand"
          loading={dashLoading}
          action={{ label: 'View all interns', to: '/coordinator/interns' }}
        >
          <DeltaChip value={dash?.deltas.totalStudents ?? null} period="from last year" />
        </StatCard>

        <StatCard
          label="Active internships"
          value={ov ? ov.activePlacements.toLocaleString() : <NoValue />}
          icon={Briefcase}
          tone="ok"
          loading={dashLoading}
        >
          <DeltaChip value={dash?.deltas.activePlacements ?? null} period="from last month" />
        </StatCard>

        <StatCard
          label="Applications"
          value={ov ? ov.applications.toLocaleString() : <NoValue />}
          icon={FileText}
          tone="info"
          loading={dashLoading}
          footnote={ov?.applications ? `${ov.shortlisted} shortlisted` : 'No applications yet'}
        >
          <DeltaChip value={dash?.deltas.applications ?? null} period="from last month" />
        </StatCard>

        <StatCard
          label="Placed students"
          value={ov ? ov.placedStudents.toLocaleString() : <NoValue />}
          icon={Check}
          tone="done"
          loading={dashLoading}
        >
          <DeltaChip value={dash?.deltas.placedStudents ?? null} period="from last month" />
        </StatCard>
      </div>

      {/* Application overview · internship status · insights */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader
            title="Application overview"
            subtitle="Applications received against those shortlisted"
          />
          <MultiLineTrend
            data={appTrend as unknown as Record<string, unknown>[]}
            xKey="day"
            series={[
              { key: 'applications', label: 'Applications', color: 'var(--chart-line)' },
              { key: 'shortlisted',  label: 'Shortlisted',  color: 'var(--chart-1)' },
            ]}
          />
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Internship status" />
          <DonutStat
            data={statusDonut}
            centerValue={statusTotal}
            centerCaption="Total"
            emptyHint="Placements appear here once they are registered."
          />
          {statusTotal > 0 && (
            <div className="mt-4 rounded-xl bg-brand-soft p-3">
              <p className="text-xs text-ink-secondary">
                <span className="font-semibold text-brand-ink">Signal:</span>{' '}
                {inProgressShare}% of placements are in progress.
              </p>
              <Link to="/coordinator/interns" className="mt-1 inline-block text-xs font-semibold text-brand-ink hover:underline">
                View analysis →
              </Link>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Insights</span>}
            subtitle="Based on your cohort's own data"
            action={{ label: 'View all', to: '/ai-insights' }}
          />
          <div className="space-y-2.5">
            <Link
              to="/coordinator/interns"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok">
                <TrendingUp className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Application activity</span>
                <span className="block text-xs text-ink-secondary">
                  {appTrend.length === 0
                    ? 'No applications yet — trends appear once students apply.'
                    : `${appTrend.reduce((n, d) => n + d.applications, 0)} applications in the last 30 days.`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>

            <Link
              to="/coordinator/interns?attention=1"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warn-soft text-warn">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">At-risk internships</span>
                <span className="block text-xs text-ink-secondary">
                  {risk.high === 0
                    ? 'No placement is currently flagged high risk.'
                    : `${risk.high} flagged high risk and may need intervention.`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>

            <Link
              to="/coordinator/companies"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-done-soft text-done">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Top host company</span>
                <span className="block text-xs text-ink-secondary">
                  {topDept
                    ? `${topDept.name} hosts the most interns (${topDept._count.placements}).`
                    : 'No company is hosting interns yet.'}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          </div>
        </Card>
      </div>

      {/* Applications · deadlines · placement rate */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent applications" action={{ label: 'View all', to: '/coordinator/interns' }} />
          {applications.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No applications yet"
              hint="Post an internship opportunity and student applications appear here."
            />
          ) : (
            <ul className="space-y-3">
              {applications.map((a) => (
                <li key={a.id} className="flex items-center gap-3">
                  <InitialsAvatar name={`${a.student.firstName} ${a.student.lastName}`} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {a.student.firstName} {a.student.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {a.opportunity.title} @ {a.opportunity.company.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={APPLICATION_TONE[a.status] ?? 'neutral'}>
                      {a.status.replace(/_/g, ' ')}
                    </Badge>
                    <p className="mt-1 text-[11px] text-ink-muted">{relativeTime(a.submittedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming deadlines" action={{ label: 'View calendar', to: '/coordinator/settings' }} />
          {(dash?.upcomingDeadlines ?? []).length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No deadlines"
              hint="Closing dates on published opportunities show up here."
            />
          ) : (
            <ul className="space-y-3">
              {dash!.upcomingDeadlines.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <DateTile date={new Date(d.closesAt!)} tone="warn" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                    <p className="truncate text-xs text-ink-muted">{d.company.name}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-warn">{daysLeft(d.closesAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title="Placement rate"
            subtitle="Measured, not predicted"
          />
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="relative grid h-32 w-32 place-items-center">
              {/* A ring, not a gauge with a forecast in it: this is the share of
                  students who actually hold a placement today. */}
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-sunken)" strokeWidth="12" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke="var(--chart-1)" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${((dash?.placementRate ?? 0) / 100) * 327} 327`}
                />
              </svg>
              <div className="text-center">
                <span className="block text-2xl font-bold text-ink">
                  {dash?.placementRate != null ? `${dash.placementRate}%` : '—'}
                </span>
                <span className="block text-[11px] text-ink-muted">of students</span>
              </div>
            </div>

            <div className="mt-4 w-full space-y-1.5 border-t border-line pt-3">
              <p className="text-xs font-semibold text-ink">What this counts</p>
              <p className="flex items-center gap-2 text-xs text-ink-secondary">
                <Check className="h-3.5 w-3.5 text-ok" /> Placements approved or completed
              </p>
              <p className="flex items-center gap-2 text-xs text-ink-secondary">
                <Check className="h-3.5 w-3.5 text-ok" /> Over every registered student
              </p>
              <p className="mt-2 text-[11px] text-ink-muted">
                A measured rate. No placement outcome is forecast — there is no
                labelled outcome data to support one.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Working panels */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 lg:col-span-8">
          <InternStatusTable pageSize={8} viewAllHref="/coordinator/interns" scopeYearId={scopeYearId} />
          <SupervisorWorkloadPanel scopeYearId={scopeYearId} />
          <GradeDistributionPanel academicYearId={statsYearId} />
          <RegionRollupPanel academicYearId={statsYearId} />

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
                className="block w-full rounded-card border border-line py-2 text-center text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                View placements
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Partner companies */}
      <Card>
        <CardHeader
          title="Top host companies"
          subtitle="Ranked by interns currently placed"
          action={{ label: 'View all partners', to: '/coordinator/companies' }}
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
        {(dash?.partnerCompanies ?? []).length === 0 ? (
          <EmptyState icon={Building2} title="No host companies yet" hint="Companies appear once placements are approved." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {dash!.partnerCompanies.map((c) => (
              <Link
                key={c.id}
                to="/coordinator/companies"
                className="flex flex-col items-center gap-2 rounded-xl border border-line p-3 text-center transition-colors hover:border-brand hover:bg-brand-soft"
              >
                {/* A monogram, never a borrowed mark: an unlicensed logo is a
                    legal problem, initials are just the company's name. */}
                {c.logoUrl
                  ? <img src={c.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
                  : <InitialsAvatar name={c.name} size={40} className="rounded-lg" />}
                <span className="w-full truncate text-xs font-semibold text-ink">{c.name}</span>
                <span className="text-[11px] text-ink-muted">
                  {c._count.placements} intern{c._count.placements === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Compliance strip — a real configured figure, kept from the working set */}
      {ov && (
        <Card>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="min-w-[140px]">
              <p className="text-xs text-ink-secondary">Compliance rate</p>
              <p className="text-lg font-bold text-ink">{ov.complianceRate}%</p>
            </div>
            <div className="min-w-[140px]">
              <p className="text-xs text-ink-secondary">Average performance</p>
              <p className="text-lg font-bold text-ink">
                {ov.avgPerformance != null ? ov.avgPerformance.toFixed(1) : <NoValue />}
              </p>
              {ov.avgPerformance != null && (
                <ProgressBar value={ov.avgPerformance} className="mt-1.5 w-32" label="Average performance" />
              )}
            </div>
            <div className="min-w-[140px]">
              <p className="text-xs text-ink-secondary">Needs attention</p>
              <p className="text-lg font-bold text-ink">{ov.needsAttention}</p>
            </div>
            <div className="min-w-[140px]">
              <p className="text-xs text-ink-secondary">Pending placements</p>
              <p className="text-lg font-bold text-ink">{ov.pendingApprovals}</p>
            </div>
            <Link
              to="/coordinator/interns?attention=1"
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"
            >
              <Clock className="h-4 w-4" /> Review flagged interns
            </Link>
          </div>
        </Card>
      )}

      {showDistribution && (
        <PerformanceDistributionModal scopeYearId={scopeYearId} onClose={() => setShowDistribution(false)} />
      )}
    </div>
  );
}

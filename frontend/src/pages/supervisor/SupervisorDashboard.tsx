import { Link } from 'react-router-dom';
import {
  AlertTriangle, Award, Briefcase, CalendarDays, Check, ChevronRight, ClipboardCheck,
  FileText, Inbox, Loader2, Sparkles, TrendingUp, Users, X,
} from 'lucide-react';
import { useSupervisorDashboard, type SupervisorDashboard as Dash } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { useVisits } from '@/hooks/useVisits';
import { usePendingApprovals, useDecideApproval } from '@/hooks/useApprovals';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, LegendDot } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { DateTile, InitialsAvatar, NoValue, ProgressBar } from '@/components/ui/Bits';
import { DonutStat } from '@/components/ui/Charts';

type Student = Dash['students'][number];

const fullName = (s: Student) => `${s.student.firstName} ${s.student.lastName}`;

function latestWeek(s: Student) {
  if (!s.recentWeeks.length) return null;
  return [...s.recentWeeks].sort((a, b) => b.week - a.week)[0];
}

function timeAgo(iso: string | null) {
  if (!iso) return 'No submissions yet';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'Submitted just now';
  if (mins < 60) return `Submitted ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Submitted ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Submitted yesterday';
  return `Submitted ${days} days ago`;
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const WEEK_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' | 'danger' }> = {
  acknowledged: { label: 'Reviewed',    tone: 'ok' },
  approved:     { label: 'Reviewed',    tone: 'ok' },
  submitted:    { label: 'Submitted',   tone: 'info' },
  returned:     { label: 'Returned',    tone: 'danger' },
  draft:        { label: 'Draft',       tone: 'neutral' },
  not_started:  { label: 'Not started', tone: 'neutral' },
};

const VISIT_LABEL: Record<string, string> = {
  site_visit:     'Site Visit',
  review_meeting: 'Progress Review',
  midterm_review: 'Midterm Review',
  final_review:   'Final Review',
  check_in:       'Check-in',
};

const APPROVAL_LABEL: Record<string, string> = {
  leave:             'Leave Request',
  extension:         'Extension Request',
  supervisor_change: 'Change of Supervisor',
  training_plan:     'Training Plan',
  company_transfer:  'Change of Attachment',
};

/**
 * Academic supervisor dashboard, laid out to the reference design: five
 * headline figures, then students / progress / reviews, then submissions /
 * approvals / signals.
 *
 * Scope is resolved server-side from the JWT — the student set comes from
 * `placement.academicSupervisorId`, never a client-supplied parameter.
 */
export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useSupervisorDashboard();
  const { data: visits = [] } = useVisits({ upcomingOnly: true });
  const { data: approvals = [] } = usePendingApprovals();
  const decide = useDecideApproval();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  const overview = data?.overview ?? {
    assignedStudents: 0, pendingReview: 0, avgQualityScore: null,
    reportsThisMonth: 0, completedInternships: 0, pendingApprovals: 0, avgProgress: null,
  };
  const students = data?.students ?? [];

  // "88% of total" — active against everything this supervisor has carried.
  const totalEverSupervised = overview.assignedStudents + overview.completedInternships;
  const activeShare = totalEverSupervised > 0
    ? Math.round((overview.assignedStudents / totalEverSupervised) * 100)
    : null;

  // The four states in the reference legend, each from a real signal: finalized
  // placements are Completed, the rest split by the risk engine's tier.
  const completed = students.filter((s) => s.finalizationStatus === 'finalized').length;
  const live = students.filter((s) => s.finalizationStatus !== 'finalized');
  const onTrack = live.filter((s) => s.riskTier === 'low' || s.riskTier == null).length;
  const atRisk = live.filter((s) => s.riskTier === 'medium').length;
  const behind = live.filter((s) => s.riskTier === 'high').length;

  const donut = [
    { label: 'On Track',  value: onTrack,   color: 'var(--chart-1)' },
    { label: 'At Risk',   value: atRisk,    color: 'var(--chart-2)' },
    { label: 'Completed', value: completed, color: 'var(--chart-3)' },
    { label: 'Behind',    value: behind,    color: 'var(--chart-4)' },
  ].filter((d) => d.value > 0);

  const highRisk = students.filter((s) => s.riskTier === 'high');
  const topPerformers = students.filter((s) => (s.avgQualityScore ?? 0) >= 80);
  const awaitingReview = students
    .map((s) => latestWeek(s))
    .filter((w) => w && w.status === 'submitted');

  const recentSubmissions = [...students]
    .filter((s) => s.lastSubmittedAt != null)
    .sort((a, b) => new Date(b.lastSubmittedAt!).getTime() - new Date(a.lastSubmittedAt!).getTime())
    .slice(0, 5);

  const atRiskShare = students.length > 0
    ? Math.round(((atRisk + behind) / students.length) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">Welcome back, {user?.firstName}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Here's an overview of your supervised students and activities.
        </p>
      </header>

      {/* Five headline figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="My supervised students"
          value={overview.assignedStudents}
          icon={Users}
          tone="brand"
          action={{ label: 'View all students', to: '/supervisor/review' }}
        />
        <StatCard
          label="Internships active"
          value={overview.assignedStudents}
          icon={Briefcase}
          tone="ok"
          footnote={activeShare != null ? `${activeShare}% of total` : 'No completed placements yet'}
        />
        <StatCard
          label="Reports submitted"
          value={overview.reportsThisMonth}
          icon={FileText}
          tone="info"
          footnote="This month"
        />
        <StatCard
          label="Pending reviews"
          value={overview.pendingReview}
          icon={ClipboardCheck}
          tone={overview.pendingReview > 0 ? 'warn' : 'ok'}
          footnote={overview.pendingReview > 0 ? 'Action required' : 'Nothing waiting'}
        />
        <StatCard
          label="Completed internships"
          value={overview.completedInternships}
          icon={Award}
          tone="done"
          footnote="Finalized"
        />
      </div>

      {/* Students · progress · reviews */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="My students" action={{ label: 'View all', to: '/supervisor/review' }} />

          {students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students assigned yet"
              hint="Your coordinator assigns interns by region; they appear here once assigned."
            />
          ) : (
            <>
              <div className="mb-2 flex items-center gap-3 pl-12 text-[11px] font-medium text-ink-muted">
                <span className="flex-1">Progress</span>
                <span className="w-16 text-right">Next review</span>
              </div>

              <ul className="flex-1 space-y-3">
                {students.slice(0, 5).map((s) => (
                  <li key={s.placementId} className="flex items-center gap-3">
                    <InitialsAvatar name={fullName(s)} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{fullName(s)}</p>
                      <p className="truncate text-xs text-ink-muted">{s.company ?? 'No company'}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar
                          value={s.progressPct}
                          tone={
                            s.progressPct == null ? 'brand'
                              : s.progressPct >= 70 ? 'ok'
                              : s.progressPct >= 40 ? 'warn' : 'danger'
                          }
                          className="flex-1"
                          label={`${fullName(s)} progress`}
                        />
                        <span className="w-9 text-right text-xs font-semibold text-ink">
                          {s.progressPct != null
                            ? `${s.progressPct}%`
                            : <NoValue title="Nothing due yet" />}
                        </span>
                      </div>
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs font-medium text-ink-secondary">
                      {s.nextReviewAt ? shortDate(s.nextReviewAt) : '—'}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                to="/supervisor/review"
                className="mt-4 block rounded-card border border-line py-2 text-center text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                View all students
              </Link>
            </>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Overall progress overview" />
          <DonutStat
            data={donut}
            centerValue={overview.avgProgress != null ? `${overview.avgProgress}%` : '—'}
            centerCaption="Average progress"
            emptyHint="Progress appears once your interns start submitting."
          />

          {students.length > 0 && (
            <div className="mt-4 rounded-xl bg-brand-soft p-3">
              {/* Derived from the rule-based risk engine — the wording says
                  "flagged", never "will fail". It is a signal, not a forecast. */}
              <p className="text-xs text-ink-secondary">
                <span className="font-semibold text-brand-ink">Signal:</span>{' '}
                {atRiskShare}% of your students are flagged at risk or behind.
              </p>
              <Link to="/ai-insights" className="mt-1 inline-block text-xs font-semibold text-brand-ink hover:underline">
                View details →
              </Link>
            </div>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Upcoming reviews" action={{ label: 'View calendar', to: '/supervisor/finalize' }} />
          {visits.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              hint="Reviews you schedule appear here — and on the student's dashboard."
            />
          ) : (
            <>
              <ul className="flex-1 space-y-3">
                {visits.slice(0, 5).map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <DateTile date={new Date(v.scheduledAt)} tone="brand" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {v.placement.student.firstName} {v.placement.student.lastName}
                      </p>
                      <p className="truncate text-xs text-ink-muted">
                        {v.placement.company?.name ?? 'No company'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone="brand">{VISIT_LABEL[v.visitType] ?? 'Review'}</Badge>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {new Date(v.scheduledAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/supervisor/finalize"
                className="mt-4 block rounded-card border border-line py-2 text-center text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                View full schedule
              </Link>
            </>
          )}
        </Card>
      </div>

      {/* Submissions · approvals · signals */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recent report submissions" action={{ label: 'View all', to: '/supervisor/review' }} />
          {recentSubmissions.length === 0 ? (
            <EmptyState icon={FileText} title="No submissions yet" hint="Weeks appear here as your interns submit them." />
          ) : (
            <ul className="space-y-3">
              {recentSubmissions.map((s) => {
                const week = latestWeek(s);
                const status = week ? WEEK_STATUS[week.status] ?? WEEK_STATUS.draft : null;
                return (
                  <li key={s.placementId} className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{fullName(s)}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {week ? `Weekly Report — Week ${week.week}` : 'Logbook'}
                      </p>
                      <p className="text-[11px] text-ink-muted">{timeAgo(s.lastSubmittedAt)}</p>
                    </div>
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pending approvals" action={{ label: 'View all', to: '/supervisor/review' }} />
          {approvals.length === 0 ? (
            <EmptyState icon={Inbox} title="Nothing to decide" hint="Requests from your interns land here." />
          ) : (
            <ul className="space-y-3">
              {approvals.slice(0, 4).map((a) => {
                const busy = decide.isPending && decide.variables?.id === a.id;
                return (
                  <li key={a.id} className="flex items-start gap-3">
                    <InitialsAvatar name={a.student} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{a.student}</p>
                      <p className="truncate text-xs text-ink-secondary">
                        {APPROVAL_LABEL[a.kind] ?? a.kind.replace(/_/g, ' ')}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">
                        {a.effectiveFrom
                          ? `${shortDate(a.effectiveFrom)}${a.effectiveTo ? ` – ${shortDate(a.effectiveTo)}` : ''}`
                          : a.title}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone="warn">Pending</Badge>
                      {/* A change of COMPANY is decided on its own screen: its
                          approval builds a successor placement, which this
                          panel deliberately does not attempt inline. */}
                      {a.source === 'transfer' ? (
                        <Link to="/coordinator/placements" className="text-[11px] font-semibold text-brand-ink hover:underline">
                          Review
                        </Link>
                      ) : (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide.mutate({ id: a.id, decision: 'rejected' })}
                            aria-label={`Reject ${a.title}`}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-line text-danger hover:bg-danger-soft disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide.mutate({ id: a.id, decision: 'approved' })}
                            aria-label={`Approve ${a.title}`}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-ok text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Insights &amp; recommendations</span>}
            subtitle="Derived from submission behaviour — advisory, never a prediction"
          />
          <div className="space-y-2.5">
            <Link
              to="/ai-insights"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok">
                <TrendingUp className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">High performers</span>
                <span className="block text-xs text-ink-secondary">
                  {topPerformers.length === 0
                    ? 'No intern is averaging 80 or above yet.'
                    : `${topPerformers.length} intern${topPerformers.length === 1 ? '' : 's'} averaging 80 or above.`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>

            <Link
              to="/feedback"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warn-soft text-warn">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">At-risk students</span>
                <span className="block text-xs text-ink-secondary">
                  {highRisk.length === 0
                    ? 'Nobody is currently flagged.'
                    : `${highRisk.length} flagged. Consider scheduling a one-to-one.`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>

            <Link
              to="/supervisor/review"
              className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
                <ClipboardCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Review queue</span>
                <span className="block text-xs text-ink-secondary">
                  {awaitingReview.length === 0
                    ? 'Every submitted week has been reviewed.'
                    : `${awaitingReview.length} week${awaitingReview.length === 1 ? '' : 's'} waiting on you.`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3">
            <LegendDot color="var(--chart-1)" label="On Track" />
            <LegendDot color="var(--chart-2)" label="At Risk" />
            <LegendDot color="var(--chart-3)" label="Completed" />
            <LegendDot color="var(--chart-4)" label="Behind" />
          </div>
        </Card>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  AlertTriangle, Award, ClipboardCheck, Gauge, Loader2, MessageSquare,
  Sparkles, TrendingUp, Users,
} from 'lucide-react';
import { useSupervisorDashboard, type SupervisorDashboard as Dash } from '@/hooks/useDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { InitialsAvatar, NoValue, ProgressBar } from '@/components/ui/Bits';
import { DonutStat } from '@/components/ui/Charts';

type Student = Dash['students'][number];

const fullName = (s: Student) => `${s.student.firstName} ${s.student.lastName}`;

function latestWeek(s: Student) {
  if (!s.recentWeeks.length) return null;
  return [...s.recentWeeks].sort((a, b) => b.week - a.week)[0];
}

function formatWhen(iso: string | null) {
  if (!iso) return 'No submissions yet';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  if (diff < 86_400_000) return `Today, ${time}`;
  if (diff < 172_800_000) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
}

const WEEK_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' | 'danger' }> = {
  approved:      { label: 'Approved',      tone: 'ok' },
  acknowledged:  { label: 'Acknowledged',  tone: 'ok' },
  submitted:     { label: 'Pending review', tone: 'warn' },
  under_review:  { label: 'In review',     tone: 'info' },
  returned:      { label: 'Returned',      tone: 'danger' },
  flagged:       { label: 'Flagged',       tone: 'danger' },
  late:          { label: 'Late',          tone: 'danger' },
  draft:         { label: 'Draft',         tone: 'neutral' },
  pending:       { label: 'Not submitted', tone: 'neutral' },
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
};

const RISK: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  low:    { label: 'On track', tone: 'ok' },
  medium: { label: 'At risk',  tone: 'warn' },
  high:   { label: 'Behind',   tone: 'danger' },
};

/**
 * Academic supervisor dashboard.
 *
 * Scope is resolved server-side from the JWT — the student set comes from
 * `placement.academicSupervisorId`, never from a client-supplied parameter, so
 * there is nothing here a supervisor could widen by editing a request.
 *
 * The reference design's scheduled-review widgets (next review date, upcoming
 * reviews with times) are absent: `visit_schedules` exists as a table but has
 * no writer anywhere in the codebase, and a date rendered from nothing is worse
 * than no date. That is its own phase.
 */
export default function SupervisorDashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useSupervisorDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  const overview = data?.overview ?? { assignedStudents: 0, pendingReview: 0, avgQualityScore: null };
  const students = data?.students ?? [];

  const byTier = (t: string) => students.filter((s) => s.riskTier === t).length;
  const unscored = students.filter((s) => s.riskTier == null).length;

  // The donut reports the risk tiers the risk engine actually produced, rather
  // than inventing an "on track / behind / completed" split the data cannot
  // support. Unscored is shown, not hidden — a student with no signal yet is
  // not a student doing well.
  const donut = [
    { label: 'On track', value: byTier('low'),    color: 'var(--chart-1)' },
    { label: 'At risk',  value: byTier('medium'), color: 'var(--chart-2)' },
    { label: 'Behind',   value: byTier('high'),   color: 'var(--chart-4)' },
    { label: 'No signal yet', value: unscored,    color: 'var(--chart-3)' },
  ].filter((s) => s.value > 0);

  const highRisk = students.filter((s) => s.riskTier === 'high');
  const topPerformer = [...students]
    .filter((s) => s.avgQualityScore != null)
    .sort((a, b) => (b.avgQualityScore ?? 0) - (a.avgQualityScore ?? 0))[0];

  // Each student's most recent week that is actually waiting on this supervisor.
  const pendingRows = students
    .map((s) => ({ s, w: latestWeek(s) }))
    .filter(({ w }) => w && (w.status === 'submitted' || w.status === 'under_review'))
    .slice(0, 6);

  const recentSubmissions = [...students]
    .filter((s) => s.lastSubmittedAt != null)
    .sort((a, b) => new Date(b.lastSubmittedAt!).getTime() - new Date(a.lastSubmittedAt!).getTime())
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">Welcome back, {user?.firstName}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          An overview of the interns you supervise and what needs your attention.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Supervised interns"
          value={overview.assignedStudents}
          icon={Users}
          tone="brand"
          footnote="Active placements assigned to you"
          action={{ label: 'View all', to: '/supervisor/review' }}
        />
        <StatCard
          label="Pending reviews"
          value={overview.pendingReview}
          icon={ClipboardCheck}
          tone={overview.pendingReview > 0 ? 'warn' : 'ok'}
          footnote={overview.pendingReview > 0 ? 'Waiting on you' : 'Nothing waiting'}
          action={{ label: 'Open review queue', to: '/supervisor/review' }}
        />
        <StatCard
          label="Average quality"
          value={overview.avgQualityScore != null ? `${Math.round(overview.avgQualityScore)} / 100` : <NoValue title="No scored weeks yet" />}
          icon={Gauge}
          tone="done"
          footnote="Across your interns' reviewed weeks"
        />
        <StatCard
          label="Needing attention"
          value={highRisk.length}
          icon={AlertTriangle}
          tone={highRisk.length > 0 ? 'danger' : 'ok'}
          footnote={highRisk.length > 0 ? 'Flagged high risk' : 'No one flagged'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Students */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="My interns"
            subtitle="Quality score and where their latest week sits"
            action={{ label: 'Review logbooks', to: '/supervisor/review' }}
          />
          {students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No interns assigned yet"
              hint="Your coordinator assigns interns by region; they appear here once assigned."
            />
          ) : (
            <ul className="divide-y divide-line">
              {students.map((s) => {
                const week = latestWeek(s);
                const status = week ? WEEK_STATUS[week.status] ?? WEEK_STATUS.pending : null;
                const risk = s.riskTier ? RISK[s.riskTier] : null;
                const quality = s.avgQualityScore != null ? Math.round(s.avgQualityScore) : null;

                return (
                  <li key={s.placementId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <InitialsAvatar name={fullName(s)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{fullName(s)}</p>
                        {risk && <Badge tone={risk.tone}>{risk.label}</Badge>}
                      </div>
                      <p className="truncate text-xs text-ink-muted">{formatWhen(s.lastSubmittedAt)}</p>
                    </div>

                    <div className="hidden w-32 sm:block">
                      {quality != null ? (
                        <>
                          <ProgressBar
                            value={quality}
                            tone={quality >= 70 ? 'ok' : quality >= 50 ? 'warn' : 'danger'}
                            label={`${fullName(s)} average quality`}
                          />
                          <p className="mt-1 text-right text-xs text-ink-muted">{quality}/100</p>
                        </>
                      ) : (
                        <p className="text-right text-xs text-ink-muted">Not scored yet</p>
                      )}
                    </div>

                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Risk mix */}
        <Card>
          <CardHeader title="Cohort standing" subtitle="Rule-based risk tiers, advisory only" />
          <DonutStat
            data={donut}
            centerValue={students.length}
            centerCaption={students.length === 1 ? 'intern' : 'interns'}
            emptyHint="Risk tiers appear once your interns start submitting."
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Awaiting review */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Awaiting your review"
            subtitle="Each intern's most recent submitted week"
            action={{ label: 'Open queue', to: '/supervisor/review' }}
          />
          {pendingRows.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Nothing waiting" hint="Every submitted week has been reviewed." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-ink-muted">
                    <th className="pb-2 font-medium">Intern</th>
                    <th className="pb-2 font-medium">Week</th>
                    <th className="pb-2 font-medium">Submitted</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pendingRows.map(({ s, w }) => {
                    const status = WEEK_STATUS[w!.status] ?? WEEK_STATUS.pending;
                    return (
                      <tr key={s.placementId} className="hover:bg-surface-sunken">
                        <td className="py-2.5">
                          <Link to="/supervisor/review" className="flex items-center gap-2 font-medium text-ink hover:text-brand-ink">
                            <InitialsAvatar name={fullName(s)} size={28} />
                            <span className="truncate">{fullName(s)}</span>
                          </Link>
                        </td>
                        <td className="py-2.5 text-ink-secondary">Week {w!.week}</td>
                        <td className="py-2.5 text-ink-secondary">{formatWhen(s.lastSubmittedAt)}</td>
                        <td className="py-2.5"><Badge tone={status.tone}>{status.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Signals */}
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Signals</span>}
            subtitle="Derived from submission behaviour, not a prediction"
          />
          <div className="space-y-3">
            {highRisk.length > 0 ? (
              <div className="rounded-xl border border-danger bg-danger-soft p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                  <AlertTriangle className="h-4 w-4" />
                  {highRisk.length} intern{highRisk.length === 1 ? '' : 's'} need a check-in
                </p>
                <ul className="mt-2 space-y-1">
                  {highRisk.slice(0, 3).map((s) => (
                    <li key={s.placementId} className="text-xs text-ink-secondary">
                      <span className="font-medium text-ink">{fullName(s)}</span>
                      {s.riskFactors.length > 0 && ` — ${s.riskFactors.slice(0, 2).join(', ')}`}
                    </li>
                  ))}
                </ul>
                <Link to="/feedback" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white">
                  <MessageSquare className="h-3.5 w-3.5" /> Message them
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-ok bg-ok-soft p-3">
                <p className="text-sm font-semibold text-ok">No one is flagged</p>
                <p className="mt-1 text-xs text-ink-secondary">
                  Every intern is submitting within the configured thresholds.
                </p>
              </div>
            )}

            {topPerformer && (
              <div className="rounded-xl border border-line bg-surface-sunken p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Award className="h-4 w-4 text-done" /> Leading the cohort
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  <span className="font-medium text-ink">{fullName(topPerformer)}</span>
                  {' '}averages {Math.round(topPerformer.avgQualityScore ?? 0)}/100.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent submissions */}
      <Card>
        <CardHeader
          title="Recent submissions"
          subtitle="Most recent logbook activity across your interns"
          action={{ label: 'Finalize placements', to: '/supervisor/finalize' }}
        />
        {recentSubmissions.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No submissions yet" hint="Weeks appear here as your interns submit them." />
        ) : (
          <ul className="divide-y divide-line">
            {recentSubmissions.map((s) => {
              const week = latestWeek(s);
              const status = week ? WEEK_STATUS[week.status] ?? WEEK_STATUS.pending : null;
              return (
                <li key={s.placementId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <InitialsAvatar name={fullName(s)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{fullName(s)}</p>
                    <p className="text-xs text-ink-muted">
                      {week ? `Week ${week.week}` : 'Logbook'} · {formatWhen(s.lastSubmittedAt)}
                    </p>
                  </div>
                  {status && <Badge tone={status.tone}>{status.label}</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

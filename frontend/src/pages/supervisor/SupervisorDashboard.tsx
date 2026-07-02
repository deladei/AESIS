import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, CheckCircle2, MessageSquare, Sparkles, AlertTriangle,
  CalendarClock, Zap, ArrowUpCircle, ChevronDown, Loader2, Users,
} from 'lucide-react';
import { useSupervisorDashboard, type SupervisorDashboard as Dash } from '@/hooks/useDashboard';

type Student = Dash['students'][number];

// ── helpers ──────────────────────────────────────────────────────
function initials(s: Student) {
  return `${s.student.firstName[0] ?? ''}${s.student.lastName[0] ?? ''}`.toUpperCase();
}
function fullName(s: Student) {
  return `${s.student.firstName} ${s.student.lastName}`;
}
function latestWeek(s: Student) {
  if (!s.recentWeeks.length) return null;
  return [...s.recentWeeks].sort((a, b) => b.week - a.week)[0];
}
function taskCount(s: Student) {
  const done = s.recentWeeks.filter((w) => w.status !== 'pending' && w.status !== 'draft' && w.status !== 'not_submitted').length;
  return { done, total: s.recentWeeks.length };
}
function reviewedCount(s: Student) {
  return s.recentWeeks.filter((w) => w.score != null).length;
}
function engagement(s: Student) {
  // Avg quality is the truthful "pulse" signal we have per student.
  return s.avgQualityScore != null ? Math.round(s.avgQualityScore) : null;
}
function formatWhen(iso: string | null) {
  if (!iso) return 'No submissions';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 86_400_000) return `Today, ${time}`;
  if (diff < 172_800_000) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

const statusBadge: Record<string, { label: string; classes: string }> = {
  approved:     { label: 'Approved',       classes: 'bg-emerald-100 text-emerald-800' },
  submitted:    { label: 'Pending review', classes: 'bg-amber-100 text-amber-800' },
  under_review: { label: 'In review',      classes: 'bg-[var(--h-e1e0ff)] text-[var(--h-373a9b)]' },
  late:         { label: 'Late',           classes: 'bg-[var(--h-ffdad6)] text-[var(--h-93000a)]' },
  flagged:      { label: 'Flagged',        classes: 'bg-[var(--h-ffdad6)] text-[var(--h-93000a)]' },
  draft:        { label: 'Draft',          classes: 'bg-[var(--h-e5eeff)] text-[var(--h-464652)]' },
  pending:      { label: 'Pending',        classes: 'bg-[var(--h-e5eeff)] text-[var(--h-464652)]' },
};

const avatarTints = [
  'bg-[var(--h-2e3192)] text-[var(--h-9da1ff)]',
  'bg-[var(--h-8a4cfc)] text-[var(--h-fffbff)]',
  'bg-[var(--h-6ffbbe)] text-[var(--h-002113)]',
];

export default function SupervisorDashboard() {
  const { data, isLoading } = useSupervisorDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }

  const overview = data?.overview ?? { assignedStudents: 0, pendingReview: 0, avgQualityScore: null };
  const students = data?.students ?? [];

  const highRisk      = students.filter((s) => s.riskTier === 'high');
  const topPerformer  = [...students]
    .filter((s) => s.avgQualityScore != null)
    .sort((a, b) => (b.avgQualityScore ?? 0) - (a.avgQualityScore ?? 0))[0];

  const pulseCards = students.slice(0, 4);

  // Pending-review queue: each student's most recent week awaiting review.
  const pendingRows = students
    .map((s) => ({ s, w: latestWeek(s) }))
    .filter(({ w }) => w && (w.status === 'submitted' || w.status === 'under_review'))
    .slice(0, 6);
  const reviewedTotal = students.reduce(
    (n, s) => n + s.recentWeeks.filter((w) => w.status === 'approved').length, 0,
  );

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 p-6 md:p-10">
      {/* Welcome & stat summary */}
      <section className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[var(--h-0b1c30)]">Supervisor Overview</h1>
          <p className="mt-1 text-base text-[var(--h-464652)]">
            Monitoring {overview.assignedStudents} active internship{overview.assignedStudents === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <StatTile label="Active Interns"  value={String(overview.assignedStudents)} valueClass="text-[var(--h-15157d)]" />
          <StatTile label="Pending Reviews" value={String(overview.pendingReview).padStart(2, '0')} valueClass="text-[var(--h-712ae2)]" />
          <StatTile
            label="Avg. Pulse"
            value={overview.avgQualityScore != null ? `${Math.round(overview.avgQualityScore)}%` : '—'}
            valueClass="text-[var(--h-22c087)]"
          />
        </div>
      </section>

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pulse Check Board */}
        <section className="col-span-12 space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--h-0b1c30)]">
              <Activity className="h-6 w-6 text-[var(--h-22c087)]" />
              Pulse Check Board
            </h2>
            <Link to="/supervisor/review" className="flex items-center gap-1 text-sm font-semibold text-[var(--h-15157d)] hover:underline">
              View Detailed Metrics <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {pulseCards.length === 0 ? (
            <EmptyPanel icon={Users} text="No interns assigned yet. Once placements are approved, your interns appear here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pulseCards.map((s) => {
                const eng = engagement(s);
                const { done, total } = taskCount(s);
                const atRisk = s.riskTier === 'high';
                const top = (s.avgQualityScore ?? 0) >= 85 && !atRisk;
                const badge = atRisk
                  ? { label: 'At Risk', classes: 'bg-[var(--h-ffdad6)] text-[var(--h-93000a)]' }
                  : top
                    ? { label: 'Top Performer', classes: 'bg-[var(--h-6ffbbe)] text-[var(--h-002113)]' }
                    : { label: 'On Track', classes: 'bg-[var(--h-dce9ff)] text-[var(--h-464652)]' };
                const barColor = atRisk ? 'bg-[var(--h-ba1a1a)]' : top ? 'bg-[var(--h-4edea3)]' : 'bg-[var(--h-15157d)]';

                return (
                  <div key={s.placementId} className="rounded-xl border border-[var(--h-c7c5d4-20)] bg-[var(--h-ffffff-70)] p-4 backdrop-blur transition-all hover:shadow-lg">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--h-e1e0ff)] text-sm font-bold text-[var(--h-15157d)]">
                          {initials(s)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[var(--h-0b1c30)]">{fullName(s)}</h3>
                          <p className="text-xs text-[var(--h-464652)]">Intern</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--h-464652)]">Weekly Engagement</span>
                        <span className="font-semibold text-[var(--h-15157d)]">{eng != null ? `${eng}%` : '—'}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${eng ?? 0}%` }} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--h-464652)]">
                        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {done}/{total} Tasks</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> {reviewedCount(s)} Reviewed</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* AI Alerts */}
        <aside className="col-span-12 space-y-4 lg:col-span-4">
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--h-0b1c30)]">
            <Sparkles className="h-6 w-6 text-[var(--h-712ae2)]" />
            AI Alerts
          </h2>
          <div className="flex flex-col gap-4">
            {highRisk.length > 0 ? (
              <AlertCard glow>
                <div className="mb-1 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[var(--h-712ae2)]" />
                  <span className="text-sm font-semibold text-[var(--h-712ae2)]">Urgent support needed</span>
                </div>
                <p className="text-base leading-tight text-[var(--h-0b1c30)]">
                  <span className="font-bold text-[var(--h-15157d)]">{fullName(highRisk[0])}</span> is flagged{' '}
                  <span className="font-semibold text-[var(--h-ba1a1a)]">high risk</span>
                  {highRisk[0].riskScore != null ? ` (score ${Math.round(highRisk[0].riskScore)})` : ''}.
                  {highRisk.length > 1 ? ` ${highRisk.length - 1} other student${highRisk.length - 1 === 1 ? '' : 's'} also need attention.` : ''}
                </p>
                <div className="rounded-lg border border-[var(--h-ba1a1a-10)] bg-[var(--h-ffdad6-30)] p-3">
                  <p className="text-sm italic text-[var(--h-93000a)]">
                    AI recommends an immediate check-in before the next deadline to prevent further drop-off.
                  </p>
                </div>
                {/* Check-ins happen in the Feedback Center's two-way thread */}
                <Link
                  to="/feedback"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--h-712ae2)] py-2 text-sm font-semibold text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-712ae2-5)]"
                >
                  <CalendarClock className="h-4 w-4" />
                  Check In With Intern
                </Link>
              </AlertCard>
            ) : (
              <AlertCard glow>
                <div className="mb-1 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--h-22c087)]" />
                  <span className="text-sm font-semibold text-[var(--h-22c087)]">All clear</span>
                </div>
                <p className="text-base leading-tight text-[var(--h-0b1c30)]">
                  No interns are currently flagged high risk. Keep up the proactive supervision.
                </p>
              </AlertCard>
            )}

            {topPerformer && (
              <AlertCard glow>
                <div className="mb-1 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[var(--h-22c087)]" />
                  <span className="text-sm font-semibold text-[var(--h-22c087)]">Growth opportunity</span>
                </div>
                <p className="text-base leading-tight text-[var(--h-0b1c30)]">
                  <span className="font-bold text-[var(--h-15157d)]">{fullName(topPerformer)}</span> is leading the cohort
                  {topPerformer.avgQualityScore != null ? ` with a ${Math.round(topPerformer.avgQualityScore)}% quality average` : ''}.
                </p>
                <p className="text-sm text-[var(--h-464652)]">
                  AI suggests a stretch task to maintain momentum — message them in the Feedback Center.
                </p>
                <Link
                  to="/feedback"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--h-712ae2)] py-2 text-sm font-semibold text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-712ae2-5)]"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Message Intern
                </Link>
              </AlertCard>
            )}
          </div>
        </aside>

        {/* Recent Submissions */}
        <section className="col-span-12 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[var(--h-0b1c30)]">Recent Submissions</h2>
            <div className="flex gap-2">
              <span className="rounded-full bg-[var(--h-8a4cfc)] px-3 py-1 text-xs font-semibold text-white">{overview.pendingReview} Pending</span>
              <span className="rounded-full bg-[var(--h-e5eeff)] px-3 py-1 text-xs font-semibold text-[var(--h-464652)]">{reviewedTotal} Reviewed</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--h-c7c5d4-20)] bg-[var(--h-ffffff)] shadow-sm">
            {pendingRows.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-[var(--h-464652)]">No submissions awaiting review.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--h-c7c5d4-30)] bg-[var(--h-eff4ff)]">
                  <tr>
                    {['Intern', 'Task title', 'Submission date', 'Status', 'Action'].map((h, i) => (
                      <th
                        key={h}
                        className={`px-6 py-4 text-xs font-semibold tracking-wide text-[var(--h-464652)] ${i === 4 ? 'text-right' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--h-c7c5d4-20)]">
                  {pendingRows.map(({ s, w }, idx) => {
                    const badge = statusBadge[w!.status] ?? statusBadge.pending;
                    return (
                      <tr key={s.placementId} className="transition-colors hover:bg-[var(--h-eff4ff)]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${avatarTints[idx % avatarTints.length]}`}>
                              {initials(s)}
                            </div>
                            <span className="text-base text-[var(--h-0b1c30)]">{fullName(s)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-base text-[var(--h-0b1c30)]">Week {w!.week} Logbook</td>
                        <td className="px-6 py-4 text-sm text-[var(--h-464652)]">{formatWhen(s.lastSubmittedAt)}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge.classes}`}>{badge.label}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            to="/supervisor/review"
                            className="inline-block rounded-lg bg-[var(--h-15157d)] px-4 py-1.5 text-sm font-semibold text-white transition-transform hover:bg-[var(--h-2e3192)] active:scale-95"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            <div className="flex justify-center bg-[var(--h-eff4ff-50)] p-4">
              <Link to="/supervisor/review" className="flex items-center gap-2 text-sm font-semibold text-[var(--h-464652)] transition-colors hover:text-[var(--h-15157d)]">
                View all submissions <ChevronDown className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── small presentational helpers ─────────────────────────────────
function StatTile({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--h-c7c5d4-20)] bg-[var(--h-ffffff)] p-4 shadow-sm">
      <span className="text-xs font-semibold text-[var(--h-464652)]">{label}</span>
      <span className={`text-2xl font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

function AlertCard({ children, glow }: { children: React.ReactNode; glow?: boolean }) {
  return (
    <div
      className="space-y-3 rounded-xl bg-[var(--h-ffffff-70)] p-5 backdrop-blur"
      style={glow ? { boxShadow: '0 0 15px -3px rgba(113,42,226,0.15), 0 4px 6px -2px rgba(113,42,226,0.05)', border: '1px solid rgba(113,42,226,0.2)' } : undefined}
    >
      {children}
    </div>
  );
}

function EmptyPanel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="rounded-xl border border-[var(--h-c7c5d4-20)] bg-[var(--h-ffffff)] p-10 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-[var(--h-8a4cfc)]" />
      <p className="text-sm text-[var(--h-464652)]">{text}</p>
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  NotebookPen, Gauge, ArrowRight, CalendarClock, CheckCircle2,
  GraduationCap, ExternalLink, Loader2, BookOpen,
  Building2, Mail, Phone, Clock, Target,
} from 'lucide-react';
import type { DashboardSupervisor } from '@/hooks/useStudentDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useEntries, useEntry } from '@/hooks/useEntries';
import { useStudentDashboard } from '@/hooks/useStudentDashboard';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { WeeklyLogbookTable } from '@/components/student/WeeklyLogbookTable';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}


function SupervisorRow({
  label, icon, supervisor,
}: {
  label: string;
  icon: React.ReactNode;
  supervisor: DashboardSupervisor | null;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-e1e0ff)] text-[var(--h-15157d)]">
          {icon}
        </div>
        <p className="text-sm font-bold text-[var(--h-191c1e)]">{label}</p>
      </div>
      {supervisor ? (
        <div className="pl-10 text-sm">
          <p className="font-semibold text-[var(--h-191c1e)]">{supervisor.name}</p>
          {supervisor.organization && (
            <p className="text-xs text-[var(--h-424654)]">{supervisor.organization}</p>
          )}
          <a
            href={`mailto:${supervisor.email}`}
            className="mt-1 flex items-center gap-1.5 text-xs text-[var(--h-15157d)] hover:underline"
          >
            <Mail className="h-3.5 w-3.5" /> {supervisor.email}
          </a>
          {supervisor.phone && (
            <a
              href={`tel:${supervisor.phone}`}
              className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--h-15157d)] hover:underline"
            >
              <Phone className="h-3.5 w-3.5" /> {supervisor.phone}
            </a>
          )}
        </div>
      ) : (
        <p className="pl-10 text-xs text-[var(--h-737785)]">Not yet assigned</p>
      )}
    </div>
  );
}

/**
 * Student Dashboard — Stitch "Student Dashboard (Updated Profile)" layout,
 * wired to live placement / logbook / notification / feedback data.
 * Chrome (sidebar + topbar) is provided by StudentShell.
 */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const active = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  // The weekly pipeline, not the retired `logbook_submissions` table: nothing
  // writes that any more, so reading it showed every student an empty logbook
  // and no supervisor feedback however much of either they actually had.
  const { data: entries = [], isLoading: subsLoading } = useEntries(active?.id);
  // Stats (avg quality + week progress) are computed server-side — validated,
  // numeric, and derived from the placement dates — never on the raw list here.
  const { data: stats } = useStudentDashboard(!!active);
  const { data: notifications = [] } = useNotifications();

  // Weeks the supervisor has decided on. The comment lives on the append-only
  // event, which only the detail endpoint carries, so the three most recent are
  // fetched in full — the same route SubmissionHistory takes.
  const decidedIds = [...entries]
    .filter((e) => e.status === 'acknowledged' || e.status === 'returned')
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .slice(0, 3)
    .map((e) => e.id);
  const fb0 = useEntry(decidedIds[0]);
  const fb1 = useEntry(decidedIds[1]);
  const fb2 = useEntry(decidedIds[2]);

  if (placementsLoading || subsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="p-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-[var(--h-191c1e)]">
          Welcome back, {user?.firstName}
        </h1>
        <div className="mt-8 rounded-xl bg-[var(--h-ffffff)] p-10 text-center">
          <BookOpen className="mx-auto mb-3 h-8 w-8 text-[var(--h-15157d)]" />
          <p className="text-base font-semibold text-[var(--h-191c1e)]">No active placement yet</p>
          <p className="mt-1 text-sm text-[var(--h-424654)]">
            Once your placement is approved, your internship progress and feedback will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── Server-computed metrics (see useStudentDashboard) ───────────
  // `total` is the expected week count derived from the placement dates; the
  // average is a validated numeric mean. Both fall back to the local list only
  // for the submitted/total tile while stats are still loading.
  const submitted    = entries.filter((e) => e.submittedAt != null);
  const weekTotal    = stats?.week?.total ?? null;
  const weekCurrent  = stats?.week?.current ?? submitted.length;
  const logsSubmitted = stats?.logsSubmitted ?? submitted.length;
  const expectedLogs  = stats?.expectedLogs ?? weekTotal;
  const pct          = stats?.completionPct ?? 0;
  const avgQuality   = stats?.avgQualityScore ?? null;
  const breakdown    = stats?.statusBreakdown
    ?? { approved: 0, pendingReview: 0, revisionRequested: 0, inProgress: 0, total: 0 };
  const hours        = stats?.hours
    ?? { logged: 0, expected: 0, perWeekMin: 0, shortfall: false };
  const objectives   = stats?.objectives ?? [];

  // The supervisor's own words for each decided week: the last acknowledge or
  // return event that carried a comment. A decision with no note is not shown —
  // an empty quote would say nothing.
  const feedbackCards = [fb0.data, fb1.data, fb2.data]
    .flatMap((entry) => {
      if (!entry) return [];
      const decision = [...(entry.events ?? [])]
        .reverse()
        .find((e) => ['acknowledged', 'returned'].includes(e.toStatus) && !!e.comment);
      return decision ? [{ entry, decision }] : [];
    });

  const recentNotifications = notifications.slice(0, 3);
  const hasUnread = notifications.some((n) => !n.isRead);

  const companyName = active.company?.name;

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-12">
        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-[var(--h-191c1e)]">
          Welcome back, {user?.firstName}
        </h1>
        <p className="text-[var(--h-424654)]">
          {companyName ? `Intern @ ${companyName}` : 'Internship in progress'}
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* ── Progress & Stats ─────────────────────────────────── */}
        <div className="col-span-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:col-span-8">
          {/* Internship Completion */}
          <div className="col-span-1 flex flex-col justify-between rounded-xl bg-[var(--h-ffffff)] p-8 md:col-span-2">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h3 className="mb-1 text-sm font-semibold text-[var(--h-424654)]">
                  Internship completion
                </h3>
                <p className="text-3xl font-extrabold text-[var(--h-191c1e)]">
                  {weekTotal != null ? `Week ${weekCurrent} of ${weekTotal}` : '—'}
                </p>
              </div>
              <span className="rounded-full bg-[var(--h-e1e0ff)] px-3 py-1 text-xs font-semibold text-[var(--h-15157d)]">
                {pct}% complete
              </span>
            </div>
            <div className="mb-4 h-4 w-full overflow-hidden rounded-full bg-[var(--h-e7e8eb)]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: 'linear-gradient(135deg,#15157d 0%,#2e3192 100%)' }}
              />
            </div>
            <div className="flex justify-between text-xs font-medium text-[var(--h-424654)]">
              <span>Started: {formatDate(active.startDate)}</span>
              <span>Ends: {formatDate(active.endDate)}</span>
            </div>
          </div>

          {/* Logbook status breakdown — driven by the entries state machine */}
          <div className="col-span-1 rounded-xl bg-[var(--h-f3f3f7)] p-8 md:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-ffffff)] text-[var(--h-15157d)]">
                <NotebookPen className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[var(--h-424654)]">
                Logbook status
                {expectedLogs != null && (
                  <span className="ml-2 text-xs text-[var(--h-737785)]">
                    {logsSubmitted} of {expectedLogs} weeks logged
                  </span>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { label: 'Approved',  value: breakdown.approved,          cls: 'bg-[var(--h-e9f9ef)] text-[var(--h-1b7a45)]' },
                { label: 'In review', value: breakdown.pendingReview,     cls: 'bg-[var(--h-eef1ff)] text-[var(--h-15157d)]' },
                { label: 'Revision',  value: breakdown.revisionRequested, cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]' },
                { label: 'In progress', value: breakdown.inProgress,      cls: 'bg-[var(--h-ffffff)] text-[var(--h-424654)]' },
              ]).map((b) => (
                <div key={b.label} className={`rounded-lg px-3 py-3 text-center ${b.cls}`}>
                  <p className="text-2xl font-extrabold">{b.value}</p>
                  <p className="mt-0.5 text-xs font-medium">{b.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Avg Quality (AI) */}
          <div className="flex items-center gap-6 rounded-xl bg-[var(--h-f3f3f7)] p-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--h-ffffff)] text-[var(--h-15157d)]">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--h-424654)]">Avg Quality Score</p>
              <p className="text-2xl font-extrabold text-[var(--h-191c1e)]">
                {avgQuality != null ? `${avgQuality} / 100` : '—'}
              </p>
            </div>
          </div>

          {/* Attendance Hours — cumulative logged vs the cohort's weekly minimum */}
          <div className="flex items-center gap-6 rounded-xl bg-[var(--h-f3f3f7)] p-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--h-ffffff)] text-[var(--h-15157d)]">
              <Clock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--h-424654)]">Attendance Hours</p>
              {hours.expected > 0 ? (
                <>
                  <p className="text-2xl font-extrabold text-[var(--h-191c1e)]">
                    {hours.logged}
                    <span className="text-base font-bold text-[var(--h-737785)]"> / {hours.expected} h</span>
                  </p>
                  {hours.shortfall ? (
                    <span className="mt-1 inline-flex w-fit items-center rounded-full bg-[var(--h-fde7e7)] px-2 py-0.5 text-xs font-semibold text-[var(--h-8a1c1c)]">
                      {Math.round((hours.expected - hours.logged) * 100) / 100} h below target
                    </span>
                  ) : (
                    <p className="mt-0.5 text-xs font-medium text-[var(--h-1b7a45)]">
                      On track · {hours.perWeekMin} h/week
                    </p>
                  )}
                </>
              ) : (
                <p className="text-2xl font-extrabold text-[var(--h-191c1e)]">
                  {hours.logged} h
                  <span className="ml-2 align-middle text-xs font-medium text-[var(--h-737785)]">logged</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Quick Actions + Notifications ────────────────────── */}
        <div className="col-span-12 space-y-8 lg:col-span-4">
          {/* Quick Actions */}
          <div className="rounded-xl bg-[var(--h-e7e8eb)] p-6">
            <h3 className="mb-4 font-bold text-[var(--h-191c1e)]">Quick Actions</h3>
            <div className="space-y-3">
              {[
                { label: 'New Logbook Entry', to: '/student/logbook' },
                { label: 'View Submissions',  to: '/student/submissions' },
                { label: 'AESIS Assistant',   to: '/student/chatbot' },
              ].map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex w-full items-center justify-between rounded-lg bg-[var(--h-ffffff)] px-4 py-3 text-left text-[var(--h-424654)] transition-all hover:text-[var(--h-15157d)]"
                >
                  <span className="text-sm font-medium">{action.label}</span>
                  <ArrowRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>

          {/* Your supervisors */}
          <div className="rounded-xl bg-[var(--h-ffffff)] p-6">
            <h3 className="mb-5 font-bold text-[var(--h-191c1e)]">Your Supervisors</h3>
            <div className="space-y-5">
              <SupervisorRow
                label="Academic Supervisor"
                icon={<GraduationCap className="h-4 w-4" />}
                supervisor={stats?.supervisors?.academic ?? null}
              />
              <SupervisorRow
                label="Company Supervisor"
                icon={<Building2 className="h-4 w-4" />}
                supervisor={stats?.supervisors?.company ?? null}
              />
            </div>
          </div>

          {/* Learning objectives — progress counts confirmed entry links only */}
          {objectives.length > 0 && (
            <div className="rounded-xl bg-[var(--h-ffffff)] p-6">
              <div className="mb-5 flex items-center gap-2">
                <Target className="h-5 w-5 text-[var(--h-15157d)]" />
                <h3 className="font-bold text-[var(--h-191c1e)]">Learning Objectives</h3>
              </div>
              <div className="space-y-3">
                {objectives.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-[var(--h-424654)]">{o.title}</p>
                    <span className="shrink-0 rounded-full bg-[var(--h-e1e0ff)] px-2 py-0.5 text-xs font-semibold text-[var(--h-15157d)]">
                      {o.confirmedEntryCount} {o.confirmedEntryCount === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notifications */}
          <div className="rounded-xl bg-[var(--h-ffffff)] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-bold text-[var(--h-191c1e)]">Notifications</h3>
              {hasUnread && <span className="h-2 w-2 rounded-full bg-[var(--h-ba1a1a)]" />}
            </div>
            {recentNotifications.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--h-737785)]">You're all caught up.</p>
            ) : (
              <div className="space-y-6">
                {recentNotifications.map((n: Notification) => {
                  const positive = n.type === 'feedback_received';
                  return (
                    <div key={n.id} className="flex gap-4">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          positive ? 'bg-[var(--h-e1e0ff)]' : 'bg-[var(--h-ffdbcf)]'
                        }`}
                      >
                        {positive ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--h-15157d)]" />
                        ) : (
                          <CalendarClock className="h-4 w-4 text-[var(--h-812800)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--h-191c1e)]">{n.title}</p>
                        <p className="text-xs text-[var(--h-424654)]">{n.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              to="/student/notifications"
              className="mt-6 block w-full rounded py-2 text-center text-xs font-bold text-[var(--h-15157d)] transition-colors hover:bg-[var(--h-f3f3f7)]"
            >
              View All Notifications
            </Link>
          </div>
        </div>

        {/* ── Weekly Logbook table ─────────────────────────────── */}
        <div className="col-span-12">
          <WeeklyLogbookTable placementId={active.id} startDate={active.startDate} />
        </div>

        {/* ── Supervisor Feedback ──────────────────────────────── */}
        <div className="col-span-12">
          <div className="rounded-xl bg-[var(--h-f3f3f7)] p-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h3 className="text-2xl font-extrabold text-[var(--h-191c1e)]">Supervisor Feedback</h3>
                <p className="text-sm text-[var(--h-424654)]">Latest performance review and comments</p>
              </div>
              <Link
                to="/student/submissions"
                className="flex items-center gap-2 text-sm font-bold text-[var(--h-15157d)]"
              >
                Full History <ExternalLink className="h-4 w-4" />
              </Link>
            </div>

            {feedbackCards.length === 0 ? (
              <div className="rounded-xl bg-[var(--h-ffffff)] p-10 text-center">
                <GraduationCap className="mx-auto mb-3 h-8 w-8 text-[var(--h-15157d)]" />
                <p className="text-sm font-semibold text-[var(--h-191c1e)]">No supervisor feedback yet</p>
                <p className="mt-1 text-sm text-[var(--h-424654)]">
                  Once your supervisor reviews a submitted logbook, their comments will show here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {feedbackCards.map(({ entry, decision }) => {
                  const reviewer = stats?.supervisors?.academic?.name ?? 'Academic Supervisor';
                  const flagged = decision.toStatus === 'returned';
                  return (
                    <div
                      key={decision.id}
                      className={`rounded-xl bg-[var(--h-ffffff)] p-6 ${flagged ? '' : 'border-l-4 border-[var(--h-15157d)]'}`}
                    >
                      <div className="mb-4 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-e7e8eb)]">
                          <GraduationCap className="h-5 w-5 text-[var(--h-424654)]" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--h-191c1e)]">{reviewer}</p>
                          <p className="text-xs font-medium text-[var(--h-424654)]">
                            Week {entry.weekNumber} · {flagged ? 'Returned for revision' : 'Acknowledged'}
                          </p>
                        </div>
                      </div>
                      <p className="mb-4 text-sm italic text-[var(--h-424654)]">"{decision.comment}"</p>
                      <p className="text-[10px] text-[var(--h-737785)]">{timeAgo(decision.createdAt)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

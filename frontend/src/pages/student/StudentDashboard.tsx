import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Activity, Bell, BookOpen, Briefcase, Building2, CalendarDays, CheckSquare,
  ClipboardCheck, Clock, FileText, GraduationCap, Loader2, Mail, MessageSquare,
  Phone, Plus, Sparkles, Square, Target, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardSupervisor } from '@/hooks/useStudentDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useEntries, useEntry } from '@/hooks/useEntries';
import { useStudentDashboard } from '@/hooks/useStudentDashboard';
import { useNotifications } from '@/hooks/useNotifications';
import { useTasks, useUpdateTask, useCreateTask, type Task } from '@/hooks/useTasks';
import { useVisits } from '@/hooks/useVisits';
import { useResources } from '@/hooks/useResources';
import { useDocuments, formatFileSize } from '@/hooks/useDocuments';
import { WeeklyLogbookTable } from '@/components/student/WeeklyLogbookTable';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, LegendDot } from '@/components/ui/Badge';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';
import { DateTile, NoValue, ProgressBar } from '@/components/ui/Bits';
import { DonutStat, LineTrend } from '@/components/ui/Charts';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const TASK_TONE: Record<string, 'brand' | 'warn' | 'info' | 'done' | 'neutral'> = {
  report:  'brand',
  review:  'warn',
  admin:   'info',
  meeting: 'done',
  other:   'neutral',
};

const VISIT_LABEL: Record<string, string> = {
  site_visit:     'Site visit',
  review_meeting: 'Review meeting',
  midterm_review: 'Midterm review',
  final_review:   'Final review',
  check_in:       'Check-in',
};

function dueLabel(iso: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'In progress',
  pending: 'Awaiting approval',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
  failed: 'Not passed',
  transferred_out: 'Transferred',
  cancelled: 'Cancelled',
};

function SupervisorRow({
  label, icon: Icon, supervisor,
}: {
  label: string;
  icon: React.ElementType;
  supervisor: DashboardSupervisor | null;
}) {
  return (
    <div className="flex gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">{label}</p>
        {supervisor ? (
          <>
            <p className="truncate text-sm font-semibold text-ink">{supervisor.name}</p>
            {supervisor.organization && (
              <p className="truncate text-xs text-ink-secondary">{supervisor.organization}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <a href={`mailto:${supervisor.email}`} className="flex items-center gap-1 text-xs text-brand-ink hover:underline">
                <Mail className="h-3 w-3" /> Email
              </a>
              {supervisor.phone && (
                <a href={`tel:${supervisor.phone}`} className="flex items-center gap-1 text-xs text-brand-ink hover:underline">
                  <Phone className="h-3 w-3" /> Call
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Not yet assigned</p>
        )}
      </div>
    </div>
  );
}

/**
 * Student dashboard.
 *
 * Every panel here traces to a live query. Widgets from the reference design
 * whose data does not exist yet — a to-do list, a scheduled-review date, a
 * documents library, a resources shelf — are absent rather than mocked; each is
 * a named phase of its own with real schema behind it.
 */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const active = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  // The weekly pipeline, not the retired `logbook_submissions` table: nothing
  // writes that any more, so reading it showed every student an empty logbook
  // and no supervisor feedback however much of either they actually had.
  const { data: entries = [], isLoading: entriesLoading } = useEntries(active?.id);
  // Stats (avg quality + week progress) are computed server-side — validated,
  // numeric, and derived from the placement dates — never on the raw list here.
  const { data: stats } = useStudentDashboard(!!active);
  const { data: notifications = [] } = useNotifications();
  const { data: taskList } = useTasks();
  const { data: visits = [] } = useVisits({ upcomingOnly: true });
  const { data: resources = [] } = useResources();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const [newTask, setNewTask] = useState('');

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

  if (placementsLoading || entriesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-[1400px] p-6">
        <h1 className="text-2xl font-bold text-ink">
          {greeting()}, {user?.firstName}
        </h1>
        <Card className="mt-6">
          <EmptyState
            icon={Briefcase}
            title="No active placement yet"
            hint="Once your placement is approved, your internship progress, logbook and feedback all appear here."
          />
        </Card>
      </div>
    );
  }

  const documentsQuery = useDocuments(active.id);
  const documents = documentsQuery.data ?? [];

  const weekTotal = stats?.week?.total ?? null;
  const weekCurrent = stats?.week?.current ?? 0;
  const pct = stats?.completionPct ?? 0;
  const avgQuality = stats?.avgQualityScore ?? null;
  const breakdown = stats?.statusBreakdown
    ?? { approved: 0, pendingReview: 0, revisionRequested: 0, inProgress: 0, total: 0 };
  const hours = stats?.hours ?? { logged: 0, expected: 0, perWeekMin: 0, shortfall: false };
  const objectives = stats?.objectives ?? [];

  // Donut: where the weeks stand. "Completed" is the terminal acknowledged
  // state; "In review" is with the supervisor; "Needs revision" came back.
  const donut = [
    { label: 'Completed',      value: breakdown.approved,          color: 'var(--chart-3)' },
    { label: 'In review',      value: breakdown.pendingReview,     color: 'var(--chart-1)' },
    { label: 'Needs revision', value: breakdown.revisionRequested, color: 'var(--chart-4)' },
    { label: 'In progress',    value: breakdown.inProgress,        color: 'var(--chart-2)' },
  ].filter((s) => s.value > 0);

  // Trend: cumulative submitted weeks against the programme, plotted on the
  // week each entry actually closed. Derived from real submission timestamps,
  // never from a row count that could contradict the week rail above it.
  const trend = [...entries]
    .filter((e) => e.submittedAt != null)
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((e, i) => ({
      week: `Wk ${e.weekNumber}`,
      progress: weekTotal ? Math.round(((i + 1) / weekTotal) * 100) : 0,
    }));

  const feedbackCards = [fb0.data, fb1.data, fb2.data].flatMap((entry) => {
    if (!entry) return [];
    const decision = [...(entry.events ?? [])]
      .reverse()
      .find((e) => ['acknowledged', 'returned'].includes(e.toStatus) && !!e.comment);
    return decision ? [{ entry, decision }] : [];
  });

  const recentNotifications = notifications.slice(0, 4);
  const companyName = active.company?.name;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">
          {greeting()}, {user?.firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {companyName ? `Here's how your internship at ${companyName} is going.` : "Here's how your internship is going."}
        </p>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Internship status"
          value={STATUS_LABEL[active.placementStatus] ?? active.placementStatus}
          icon={Briefcase}
          tone="brand"
          footnote={`Started ${formatDate(active.startDate)}`}
        />

        <StatCard
          label="Overall progress"
          value={weekTotal ? `${pct}%` : <NoValue title="No programme dates set yet" />}
          icon={TrendingUp}
          tone="ok"
          footnote={weekTotal ? `Week ${weekCurrent} of ${weekTotal}` : 'Awaiting placement dates'}
        >
          <ProgressBar value={weekTotal ? pct : null} tone="ok" className="mt-2" label="Overall progress" />
        </StatCard>

        <StatCard
          label="Tasks completed"
          value={stats ? `${stats.tasks.done} / ${stats.tasks.total}` : <NoValue />}
          icon={CheckSquare}
          tone="info"
          footnote={
            stats && stats.tasks.total === 0
              ? 'Nothing on your list yet'
              : 'Across your to-do list'
          }
        />

        <StatCard
          label="Next review"
          value={
            stats?.nextReview
              ? new Date(stats.nextReview.scheduledAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short',
                })
              : <NoValue title="No review scheduled yet" />
          }
          icon={CalendarDays}
          tone="warn"
          footnote={
            stats?.nextReview
              ? `${VISIT_LABEL[stats.nextReview.visitType] ?? 'Review'} · ${new Date(stats.nextReview.scheduledAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}`
              : 'Your supervisor schedules these'
          }
        />
      </div>

      {/* Second KPI row — attendance and quality, both real and both worth the
          space the reference design gives to invented metrics. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Attendance hours"
          value={hours.expected > 0 ? `${hours.logged} / ${hours.expected}` : String(hours.logged)}
          icon={Clock}
          tone={hours.shortfall ? 'warn' : 'info'}
          footnote={
            hours.perWeekMin > 0
              ? `${hours.perWeekMin}h per week required`
              : 'No weekly minimum configured'
          }
        />

        <StatCard
          label="Average quality score"
          value={avgQuality != null ? `${avgQuality} / 100` : <NoValue title="No scored weeks yet" />}
          icon={ClipboardCheck}
          tone="done"
          footnote={avgQuality != null ? 'Across your reviewed weeks' : 'Appears once a week is reviewed'}
        />
      </div>

      {/* Progress + objectives */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Internship progress"
            subtitle="Where each of your logbook weeks stands"
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <DonutStat
              data={donut}
              centerValue={weekTotal ? `${pct}%` : '—'}
              centerCaption="complete"
              emptyHint="Your first logbook week will appear here."
            />
            <div>
              <p className="mb-2 text-xs font-medium text-ink-secondary">Progress over time</p>
              <LineTrend
                data={trend}
                xKey="week"
                yKey="progress"
                yLabel="Progress"
                valueSuffix="%"
                height={190}
              />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
        <Card>
          <CardHeader
            title="My to-do list"
            subtitle={taskList ? `${taskList.progress.done} of ${taskList.progress.total} done` : undefined}
            action={{ label: 'Logbook', to: '/student/logbook' }}
          />

          {/* Adding your own task is the point — a to-do list you cannot write
              to is a notification feed with checkboxes. */}
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const title = newTask.trim();
              if (title.length < 3) return;
              createTask.mutate(
                { title, category: 'other', placementId: active.id },
                { onSuccess: () => setNewTask('') },
              );
            }}
          >
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task…"
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              disabled={newTask.trim().length < 3 || createTask.isPending}
              aria-label="Add task"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-white disabled:opacity-40"
            >
              {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>

          {!taskList || taskList.tasks.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="Nothing on your list"
              hint="Add a task above, or your supervisor may assign you one."
            />
          ) : (
            <ul className="space-y-2">
              {taskList.tasks.slice(0, 6).map((t: Task) => {
                const done = t.status === 'done';
                return (
                  <li key={t.id} className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => updateTask.mutate({ id: t.id, status: done ? 'open' : 'done' })}
                      aria-label={done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                      className="mt-0.5 shrink-0 text-ink-muted transition-colors hover:text-brand"
                    >
                      {done
                        ? <CheckSquare className="h-4 w-4 text-ok" />
                        : <Square className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', done ? 'text-ink-muted line-through' : 'font-medium text-ink')}>
                        {t.title}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {done && t.completedAt
                          ? `Completed ${new Date(t.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : dueLabel(t.dueAt)}
                      </p>
                    </div>
                    <Badge tone={TASK_TONE[t.category] ?? 'neutral'}>{t.category}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Learning objectives"
            subtitle="Set with your academic supervisor"
            action={{ label: 'Logbook', to: '/student/logbook' }}
          />
          {objectives.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No objectives yet"
              hint="Your supervisor defines these at the start of the placement."
            />
          ) : (
            <ul className="space-y-3">
              {objectives.map((o) => (
                <li key={o.id} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                    <Target className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{o.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {o.confirmedEntryCount === 0
                        ? 'Not yet evidenced'
                        : `Evidenced in ${o.confirmedEntryCount} week${o.confirmedEntryCount === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  {o.confirmedEntryCount > 0 && (
                    <Badge tone="ok">{o.confirmedEntryCount}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        </div>
      </div>

      {/* Activity / details / assistant */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Recent activity"
            action={{ label: 'View all', to: '/student/notifications' }}
          />
          {recentNotifications.length === 0 ? (
            <EmptyState icon={Bell} title="Nothing yet" hint="Reminders and supervisor decisions land here." />
          ) : (
            <ul className="space-y-3">
              {recentNotifications.map((n) => (
                <li key={n.id} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-ink-secondary">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-xs text-ink-muted">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Internship details" />
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
                <Building2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-ink-muted">Company</p>
                <p className="truncate text-sm font-semibold text-ink">{companyName ?? 'Not recorded'}</p>
              </div>
            </div>

            <SupervisorRow label="Academic supervisor" icon={GraduationCap} supervisor={stats?.supervisors.academic ?? null} />
            <SupervisorRow label="Industry supervisor" icon={Briefcase} supervisor={stats?.supervisors.company ?? null} />

            <div className="flex gap-3 border-t border-line pt-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="grid flex-1 grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-ink-muted">Start date</p>
                  <p className="text-sm font-semibold text-ink">{formatDate(active.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">End date</p>
                  <p className="text-sm font-semibold text-ink">{formatDate(active.endDate)}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-brand bg-brand-soft">
          <CardHeader title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> AESIS Assistant</span>} />
          <p className="text-sm text-ink-secondary">
            Ask about logbook rules, deadlines, attendance requirements or how your
            week is assessed.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            <li>• How is my logbook scored?</li>
            <li>• When is this week due?</li>
            <li>• What counts as attendance?</li>
          </ul>
          <Link
            to="/student/chatbot"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <MessageSquare className="h-4 w-4" />
            Open the assistant
          </Link>
        </Card>
      </div>

      {/* Schedule / documents / resources */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Upcoming schedule"
            subtitle="Reviews your supervisor has booked"
          />
          {visits.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              hint="Reviews appear here as soon as your supervisor books one."
            />
          ) : (
            <ul className="space-y-3">
              {visits.slice(0, 4).map((v) => (
                <li key={v.id} className="flex items-center gap-3">
                  <DateTile date={new Date(v.scheduledAt)} tone="warn" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {VISIT_LABEL[v.visitType] ?? 'Review'}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {new Date(v.scheduledAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })}
                      {v.location ? ` · ${v.location}` : ''}
                      {` · ${v.durationMinutes} min`}
                    </p>
                  </div>
                  <Badge tone="warn">{VISIT_LABEL[v.visitType]?.split(' ')[0] ?? 'Review'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="My documents" subtitle="Files on your placement record" />
          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              hint="Your placement letter and agreement appear here once uploaded."
            />
          ) : (
            <ul className="space-y-3">
              {documents.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={d.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium text-ink hover:text-brand-ink hover:underline"
                    >
                      {d.title ?? d.fileName}
                    </a>
                    <p className="text-xs text-ink-muted">
                      {d.docType.replace(/_/g, ' ')}
                      {d.fileSize ? ` · ${formatFileSize(d.fileSize)}` : ''}
                      {` · ${formatDate(d.uploadedAt)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick resources" subtitle="Guidelines, templates and rubrics" />
          {resources.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No resources yet"
              hint="Your coordinator publishes guidelines and templates here."
            />
          ) : (
            <ul className="space-y-2">
              {resources.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <a
                    href={r.externalUrl ?? r.fileUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-line p-2.5 transition-colors hover:border-brand hover:bg-brand-soft"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                      {r.description && (
                        <span className="block truncate text-xs text-ink-muted">{r.description}</span>
                      )}
                    </span>
                    <Badge tone="neutral">{r.category}</Badge>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Week rail */}
      <WeeklyLogbookTable placementId={active.id} startDate={active.startDate} />

      {/* Supervisor feedback */}
      <Card>
        <CardHeader
          title="Supervisor feedback"
          subtitle="The most recent weeks your supervisor commented on"
          action={{ label: 'All submissions', to: '/student/submissions' }}
        />
        {fb0.isLoading ? (
          <SkeletonRows rows={2} />
        ) : feedbackCards.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No written feedback yet"
            hint="When your supervisor acknowledges or returns a week with a note, it appears here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {feedbackCards.map(({ entry, decision }) => (
              <div key={entry.id} className="rounded-xl border border-line bg-surface-sunken p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">Week {entry.weekNumber}</span>
                  <Badge tone={decision.toStatus === 'acknowledged' ? 'ok' : 'warn'}>
                    {decision.toStatus === 'acknowledged' ? 'Acknowledged' : 'Returned'}
                  </Badge>
                </div>
                <p className="text-sm text-ink-secondary">“{decision.comment}”</p>
                <p className="mt-2 text-xs text-ink-muted">{timeAgo(decision.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Status legend — the donut's hues are semantic, so they are named once
          here for anyone reading the page in greyscale. */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1 pb-2">
        <LegendDot color="var(--chart-3)" label="Completed" />
        <LegendDot color="var(--chart-1)" label="In review" />
        <LegendDot color="var(--chart-4)" label="Needs revision" />
        <LegendDot color="var(--chart-2)" label="In progress" />
      </div>
    </div>
  );
}

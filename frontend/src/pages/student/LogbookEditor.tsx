import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Plus, X, Trash2, CheckCircle2, Clock, RotateCcw, Send, Save,
  Calendar, CalendarDays, AlertCircle, BookOpen, Sparkles, ShieldCheck, Lock,
  Sun, Stethoscope, CircleSlash, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useEntries, useEntry, useSaveDay, useSubmitDay, useSubmitEntry, dayKey, type EntryStatus,
} from '@/hooks/useEntries';
import {
  useSiwesCalendar, useSaveDailyEntry, useSaveWeeklySummary, useRecordAbsence,
  type SiwesCalendarDay,
} from '@/hooks/useSiwes';
import { EntryAttachments } from '@/components/attachments/EntryAttachments';
import { FieldError } from '@/components/shared/FieldError';
import LatePill from '@/components/shared/LatePill';
import { freeText } from '@/lib/validation';
import { ghanaYMD, fmtDate, fmtRange } from '@/lib/schedule';

/**
 * The logbook — ONE screen.
 *
 * It used to be two: /student/logbook (weekly entries pipeline: activities,
 * competency tags, attachments, per-day submit) and /student/daily-logbook
 * (SIWES pipeline: work done, skills learnt, absences, holidays, weekly
 * report). They logged the same days against two backends, so a student had to
 * know which page a given field lived on.
 *
 * Now the WEEK is the container — its status, its days, its report — and a day
 * is a row inside it. Every capability from both screens is still here; none of
 * it is duplicated.
 */

// Mirrors the backend DAY_GRACE_DAYS rule: a day logged within this window of
// its own date is on time. Later is still allowed, but flagged to the supervisor.
const DAY_GRACE_DAYS = 2;

const WORK_MAX = 10_000;
const SKILLS_MAX = 10_000;
const REPORT_MAX = 20_000;
const ACTIVITY_MAX = 5_000;

const workText = freeText(WORK_MAX, 'Description of work done');
const skillsText = freeText(SKILLS_MAX, 'New skills learnt');
const reportText = freeText(REPORT_MAX, 'Weekly report');

const COMPETENCY_SUGGESTIONS = [
  'Problem Solving', 'Teamwork', 'Communication', 'Technical Writing',
  'Debugging', 'Version Control', 'Testing', 'Code Review', 'Time Management',
];

const COMPETENCY_KEYWORDS: Record<string, RegExp> = {
  'Debugging':          /\b(bug|debug|fix(ed|ing)?|error|crash|stack ?trace|exception|troubleshoot)\b/i,
  'Testing':            /\b(test(s|ed|ing)?|unit test|jest|pytest|qa|coverage|assert)\b/i,
  'Version Control':    /\b(git|commit(ted)?|branch|merge|pull request|\bpr\b|rebase|push(ed)?)\b/i,
  'Code Review':        /\b(review(ed|ing)?|feedback|pull request|\bpr\b|approv(e|ed))\b/i,
  'Technical Writing':  /\b(document(ed|ation)?|readme|wiki|spec|wrote up|notes|report)\b/i,
  'Teamwork':           /\b(team|pair(ed| programming)?|collaborat|stand-?up|colleague|together)\b/i,
  'Communication':      /\b(present(ed|ation)?|email|call|meeting|demo|explain(ed)?|client)\b/i,
  'Problem Solving':    /\b(solv(e|ed|ing)|figure(d)? out|root cause|analy(s|z)e|design(ed)? a)\b/i,
  'Time Management':    /\b(deadline|schedul|prioriti(s|z)e|sprint|on time|backlog|planned)\b/i,
};

function detectCompetencies(text: string, already: string[]): string[] {
  if (!text.trim()) return [];
  return Object.entries(COMPETENCY_KEYWORDS)
    .filter(([name, re]) => !already.includes(name) && re.test(text))
    .map(([name]) => name);
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayShort = (ymd: string) => WEEKDAY_SHORT[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
const dayOfMonth = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDate();

const errMessage = (err: unknown): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  ?? 'Something went wrong. Please try again.';

// ── Week status ─────────────────────────────────────────────────
type WeekState = EntryStatus | 'not_started' | 'upcoming';

const WEEK_STATUS_META: Record<WeekState, { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-surface-sunken text-ink-secondary', Icon: Calendar },
  upcoming:     { label: 'Upcoming',     cls: 'bg-surface-sunken text-ink-muted', Icon: Clock },
  draft:        { label: 'In progress',  cls: 'bg-warn-soft text-warn', Icon: Clock },
  submitted:    { label: 'In review',    cls: 'bg-brand-soft text-brand-ink', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-danger-soft text-danger', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-ok-soft text-ok', Icon: CheckCircle2 },
};

function WeekStatusPill({ status }: { status: WeekState }) {
  const { label, cls, Icon } = WEEK_STATUS_META[status] ?? WEEK_STATUS_META.not_started;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

// ── Day status ──────────────────────────────────────────────────
function dayVisual(day: SiwesCalendarDay, today: string, submitted: boolean) {
  if (submitted) {
    return { label: 'Submitted', cls: 'bg-ok-soft text-ok', Icon: CheckCircle2 };
  }
  // Lateness is its own pill beside this one (one shared label app-wide), so
  // this only says whether the day has been written up.
  if (day.entry) {
    return { label: 'Logged', cls: 'bg-warn-soft text-warn', Icon: Clock };
  }
  if (day.absence) {
    const kind = day.absence.kind === 'sick' ? 'Sick'
      : day.absence.kind === 'permitted' ? 'Permitted absence' : 'Unexcused absence';
    return { label: kind, cls: 'bg-surface-sunken text-ink-secondary', Icon: Stethoscope };
  }
  if (day.class === 'non_working') {
    return { label: 'Public holiday', cls: 'bg-surface-sunken text-ink-muted', Icon: Sun };
  }
  if (day.date > today) {
    return { label: 'Upcoming', cls: 'bg-surface-sunken text-ink-muted', Icon: Clock };
  }
  if (day.missing) {
    return { label: 'Not logged', cls: 'bg-danger-soft text-danger', Icon: AlertCircle };
  }
  return { label: 'Open', cls: 'bg-surface-sunken text-ink-secondary', Icon: CalendarDays };
}

type LocalActivity = { description: string; competencyTags: string[] };

export default function LogbookEditor() {
  const today = ghanaYMD();
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const placement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];

  const { data: calendar, isLoading: calendarLoading } = useSiwesCalendar(placement?.id);
  const { data: entries = [], isLoading: entriesLoading } = useEntries(placement?.id);
  const submitWeek = useSubmitEntry();

  const [searchParams] = useSearchParams();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAllMissed, setShowAllMissed] = useState(false);
  const [confirmGaps, setConfirmGaps] = useState(false);

  // The week's status/activities/attachments come from the entries spine; its
  // days, holidays and absences from the calendar. Same week number on both
  // sides since the consolidation made week numbers student-relative.
  const entryByWeek = useMemo(() => {
    const m = new Map<number, (typeof entries)[number]>();
    entries.forEach((e) => m.set(e.weekNumber, e));
    return m;
  }, [entries]);

  const weeks = useMemo(() => {
    if (!calendar) return [];
    const byWeek = new Map<number, SiwesCalendarDay[]>();
    const boundsByWeek = new Map<number, { start: string; end: string }>();
    for (const day of calendar.days) {
      // Rest days carry no state worth a row, but they still belong to the
      // week's date span (which the entries API needs on save).
      const b = boundsByWeek.get(day.weekNumber);
      boundsByWeek.set(day.weekNumber, {
        start: b ? (day.date < b.start ? day.date : b.start) : day.date,
        end:   b ? (day.date > b.end ? day.date : b.end) : day.date,
      });
      if (day.class === 'weekly_rest') continue;
      const list = byWeek.get(day.weekNumber) ?? [];
      list.push(day);
      byWeek.set(day.weekNumber, list);
    }
    return [...byWeek.entries()]
      .map(([weekNumber, days]) => ({
        weekNumber,
        days,
        bounds: boundsByWeek.get(weekNumber) ?? { start: days[0].date, end: days[days.length - 1].date },
      }))
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }, [calendar]);

  // ?week= deep link (from the dashboard table), else the current week.
  useEffect(() => {
    if (selectedWeek !== null || weeks.length === 0) return;
    const want = Number(searchParams.get('week'));
    if (weeks.some((w) => w.weekNumber === want)) { setSelectedWeek(want); return; }
    const current = [...weeks].reverse().find((w) => w.days.some((d) => d.date <= today));
    setSelectedWeek((current ?? weeks[0]).weekNumber);
  }, [weeks, selectedWeek, searchParams, today]);

  const week = weeks.find((w) => w.weekNumber === selectedWeek);
  const weekEntry = selectedWeek != null ? entryByWeek.get(selectedWeek) : undefined;
  const { data: detail } = useEntry(weekEntry?.id);
  const day = week?.days.find((d) => d.date === selectedDate) ?? null;

  if (placementsLoading || calendarLoading || entriesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" />
      </div>
    );
  }

  if (!placement || !calendar) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-brand-ink" />
        <h2 className="mb-1 text-lg font-bold text-ink">No active placement</h2>
        <p className="text-sm text-ink-secondary">
          Your logbook opens once your placement is approved and started.
        </p>
      </div>
    );
  }

  const loggedCount = calendar.days.filter((d) => d.entry).length;
  const missingCount = calendar.days.filter((d) => d.missing).length;
  // Days you owe. They were only reachable by walking the week rail and reading
  // every day's pill; the backlog gathers them so a forgotten day is one click
  // away for as long as the attachment is open. Most recent first — that is the
  // one you can still remember.
  const missedDays = calendar.days
    .filter((d) => d.missing && d.class === 'working')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const MISSED_PREVIEW = 6;
  const missedShown = showAllMissed ? missedDays : missedDays.slice(0, MISSED_PREVIEW);
  // "Over" means every day of it is behind us — only then is submitting with
  // gaps a considered choice rather than a mistake.
  const weekIsOver = !!week && week.bounds.end < today;
  const weekStatus: WeekState =
    (weekEntry?.status as EntryStatus | undefined)
    ?? (week?.days.every((d) => d.date > today) ? 'upcoming' : 'not_started');

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-ink">Logbook</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {placement.company?.name ?? 'Your placement'} · {fmtDate(calendar.chainStart)} – {fmtDate(calendar.chainEnd)}
          {' · '}{calendar.totalWeeks} weeks · {loggedCount} day{loggedCount === 1 ? '' : 's'} logged
          {missingCount > 0 && <span className="text-danger"> · {missingCount} not logged</span>}
        </p>
      </header>

      {/* Days you still owe. Silent when there are none. */}
      {missedDays.length > 0 && (
        <div className="mb-4 rounded-xl border border-warn bg-warn-soft px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-warn">
            <AlertCircle className="h-4 w-4" />
            {missedDays.length} day{missedDays.length === 1 ? '' : 's'} not logged yet
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">
            You can still log any of them. They will be marked late for your supervisor.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {missedShown.map((d) => (
              <button
                key={d.date}
                type="button"
                onClick={() => { setSelectedWeek(d.weekNumber); setSelectedDate(d.date); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-warn bg-surface px-2.5 py-1 text-xs font-semibold text-warn hover:border-warn"
              >
                <CalendarDays className="h-3 w-3" />
                {weekdayShort(d.date)} {fmtDate(d.date)}
              </button>
            ))}
            {missedDays.length > MISSED_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllMissed((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-secondary hover:text-ink"
              >
                {showAllMissed
                  ? <>Show fewer <ChevronUp className="h-3 w-3" /></>
                  : <>{missedDays.length - MISSED_PREVIEW} more <ChevronDown className="h-3 w-3" /></>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Week rail — the container you are working inside */}
      <div className="mb-4 flex flex-wrap gap-2">
        {weeks.map((w) => {
          const e = entryByWeek.get(w.weekNumber);
          const attention = w.days.some((d) => d.missing);
          const started = w.days.some((d) => d.date <= today);
          const selected = w.weekNumber === selectedWeek;
          return (
            <button
              key={w.weekNumber}
              onClick={() => { setSelectedWeek(w.weekNumber); setSelectedDate(null); setConfirmGaps(false); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                selected
                  ? 'bg-brand text-ink-inverse'
                  : started
                    ? 'bg-surface-sunken text-ink hover:bg-brand-soft'
                    : 'bg-surface-sunken text-ink-muted'
              }`}
            >
              Week {w.weekNumber}
              {e?.status === 'acknowledged' && !selected && (
                <CheckCircle2 className="ml-1.5 inline h-3 w-3 align-middle text-ok" />
              )}
              {attention && !selected && e?.status !== 'acknowledged' && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-danger align-middle" />
              )}
            </button>
          );
        })}
      </div>

      {week && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-ink">Week {week.weekNumber}</h2>
              <p className="text-sm text-ink-secondary">
                {fmtRange(week.bounds.start, week.bounds.end)}
                {' · '}
                {(detail?.days ?? []).filter((rec) =>
                  rec.status === 'submitted'
                  && week.days.some((d) => d.date === dayKey(rec)),
                ).length}
                /{week.days.filter((d) => d.class === 'working').length} days submitted
              </p>
            </div>
            {/* The week is the student's to send. Completing it does not submit
                it, so the offer has to live here — durable across a reload —
                not only in the banner on the save that finished it. */}
            <div className="flex items-center gap-3">
              {weekStatus === 'draft' && detail?.completion && (
                detail.completion.complete ? (
                  <button
                    type="button"
                    disabled={submitWeek.isPending}
                    onClick={async () => {
                      try {
                        await submitWeek.mutateAsync(detail.id);
                      } catch { /* surfaced below */ }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1.5 text-sm font-semibold text-ink-inverse hover:opacity-90 disabled:opacity-50"
                  >
                    {submitWeek.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                    Submit week
                  </button>
                ) : weekIsOver ? (
                  // A week that has ended with days missing used to be
                  // unsubmittable forever — no button was ever rendered, so it
                  // sat in draft for the rest of the attachment. The API always
                  // accepted it; only this screen refused to ask.
                  <button
                    type="button"
                    onClick={() => setConfirmGaps((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-warn bg-warn-soft px-3 py-1.5 text-sm font-semibold text-warn hover:border-warn"
                  >
                    <Send className="h-4 w-4" /> Submit week anyway
                  </button>
                ) : (
                  <span className="text-sm text-ink-secondary">
                    {detail.completion.remaining} of {detail.completion.workingDays} days left
                  </span>
                )
              )}
              <WeekStatusPill status={weekStatus} />
            </div>
          </div>
          {submitWeek.isError && (
            <p className="mb-3 text-sm text-danger">{errMessage(submitWeek.error)}</p>
          )}

          {confirmGaps && weekStatus === 'draft' && detail?.completion && !detail.completion.complete && (
            <div className="mb-3 rounded-lg border border-warn bg-warn-soft px-4 py-3">
              <p className="text-sm font-semibold text-warn">
                Send week {week.weekNumber} with {detail.completion.remaining} day
                {detail.completion.remaining === 1 ? '' : 's'} still unlogged?
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Your supervisor will see {detail.completion.missingDates.length === 1 ? 'this day' : 'these days'} as
                not logged:{' '}
                <span className="font-semibold">
                  {detail.completion.missingDates.map((d) => fmtDate(d)).join(', ')}
                </span>
                . Once sent, the week is locked until your supervisor returns it — so log what you
                can first if you still can.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitWeek.isPending}
                  onClick={async () => {
                    try {
                      await submitWeek.mutateAsync(detail.id);
                      setConfirmGaps(false);
                    } catch { /* surfaced below */ }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-ink-inverse hover:opacity-90 disabled:opacity-50"
                >
                  {submitWeek.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Send it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmGaps(false)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:border-line-strong"
                >
                  Not yet
                </button>
              </div>
            </div>
          )}

          {weekStatus === 'acknowledged' && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-ok bg-ok-soft px-4 py-3 text-sm text-ok">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Your supervisor has acknowledged this week. It is locked — days can no longer be edited.
            </div>
          )}
          {weekStatus === 'returned' && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
              This week was returned for revision — edit the days below and resubmit.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            {/* Days of this week */}
            <div className="space-y-2">
              {week.days.map((d) => {
                const submitted = (detail?.days ?? []).some(
                  (rec) => dayKey(rec) === d.date && rec.status === 'submitted',
                );
                const v = dayVisual(d, today, submitted);
                const selectable = d.class === 'working';
                return (
                  <button
                    key={d.date}
                    disabled={!selectable}
                    onClick={() => setSelectedDate(d.date)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      d.date === selectedDate
                        ? 'border-brand bg-brand-soft'
                        : 'border-line bg-surface'
                    } ${selectable ? 'hover:border-brand' : 'cursor-default opacity-70'}`}
                  >
                    <span className="w-10 shrink-0 text-center">
                      <span className="block text-[11px] font-semibold text-ink-muted">{weekdayShort(d.date)}</span>
                      <span className="block text-base font-bold text-ink">{dayOfMonth(d.date)}</span>
                    </span>
                    <span className={`inline-flex flex-wrap items-center gap-1`}>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.cls}`}>
                        <v.Icon className="h-3 w-3" /> {v.label}
                      </span>
                      <LatePill compact days={d.entry?.lateByDays ?? 0} />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The selected day, then the week's own narrative */}
            <div className="space-y-4">
              {!day ? (
                <div className="rounded-card border border-line bg-surface px-6 py-10 text-center">
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 text-brand-ink" />
                  <p className="text-sm text-ink-secondary">Select a day to log what you worked on.</p>
                </div>
              ) : (
                <DayPanel
                  key={day.date}
                  placementId={placement.id}
                  weekNumber={week.weekNumber}
                  bounds={week.bounds}
                  day={day}
                  today={today}
                  weekStatus={weekStatus}
                  entryId={weekEntry?.id ?? detail?.id}
                  daySubmitted={(detail?.days ?? []).some(
                    (rec) => dayKey(rec) === day.date && rec.status === 'submitted',
                  )}
                  activities={(detail?.activities ?? [])
                    .filter((a) => a.activityDate.slice(0, 10) === day.date)
                    .map((a) => ({ description: a.description, competencyTags: a.competencyTags ?? [] }))}
                />
              )}

              <WeeklyReportCard
                placementId={placement.id}
                weekNumber={week.weekNumber}
                // A week that has not started cannot be reported on — the API
                // rejects it (422), so do not offer the form and earn an error.
                locked={weekStatus === 'acknowledged' || weekStatus === 'upcoming'}
                lockReason={weekStatus === 'upcoming' ? 'This week has not started yet.' : undefined}
                summary={calendar.weeklySummaries.find((s) => s.weekNumber === week.weekNumber)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── One day ─────────────────────────────────────────────────────
function DayPanel({
  placementId, weekNumber, bounds, day, today, weekStatus, entryId, daySubmitted, activities: seeded,
}: {
  placementId: string;
  weekNumber: number;
  bounds: { start: string; end: string };
  day: SiwesCalendarDay;
  today: string;
  weekStatus: WeekState;
  entryId: string | undefined;
  daySubmitted: boolean;
  activities: LocalActivity[];
}) {
  const saveDailyEntry = useSaveDailyEntry(placementId);
  const saveDay = useSaveDay();
  const submitDay = useSubmitDay();
  const submitWeek = useSubmitEntry();
  const recordAbsence = useRecordAbsence(placementId);

  const [description, setDescription] = useState(day.entry?.descriptionOfWork ?? '');
  const [skills, setSkills] = useState(day.entry?.newSkillsLearnt ?? '');
  const [activities, setActivities] = useState<LocalActivity[]>(seeded);
  const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
  const [showActivities, setShowActivities] = useState(seeded.length > 0);
  const [daysLeftInWeek, setDaysLeftInWeek] = useState<number | null>(null);
  const [workingDaysInWeek, setWorkingDaysInWeek] = useState(0);
  // The save that completes a week may be the one that CREATED the week row,
  // in which case the `entryId` prop is still undefined. The response carries
  // the real id — without it the submit button below is dead exactly when it
  // is shown.
  const [savedWeekEntryId, setSavedWeekEntryId] = useState<string | null>(null);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absenceKind, setAbsenceKind] = useState<'sick' | 'permitted'>('sick');
  const [absenceReason, setAbsenceReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [weekComplete, setWeekComplete] = useState(false);
  const [weekSubmitted, setWeekSubmitted] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => { setActivities(seeded); }, [seeded]);

  const lateBy = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${day.date}T00:00:00Z`).getTime()) / 86_400_000,
  );
  const future = lateBy < 0;
  // `editableUntil` is anti-tamper for work already sent for review; the API no
  // longer applies it while the week is the student's (draft/returned), so a
  // missed day stays fillable for the whole attachment. Mirrors siwes.service.
  const weekOpen = weekStatus === 'draft' || weekStatus === 'returned' || weekStatus === 'not_started';
  const editWindowClosed =
    !weekOpen && !!day.entry && new Date(day.entry.editableUntil).getTime() < Date.now();
  const editable =
    day.class === 'working'
    && !day.absence
    && !future
    && !editWindowClosed
    && weekStatus !== 'acknowledged'
    && (!daySubmitted || weekStatus === 'returned');
  const canReportAbsence = !day.entry && !day.absence && day.class === 'working' && !future && editable;

  const descError = description.trim() ? (workText.safeParse(description).success ? undefined
    : workText.safeParse(description).error?.issues[0]?.message) : undefined;
  const skillsError = skills.trim() ? (skillsText.safeParse(skills).success ? undefined
    : skillsText.safeParse(skills).error?.issues[0]?.message) : undefined;
  const hasContent = description.trim().length > 0 && skills.trim().length > 0;
  const activityPayload = activities
    .filter((a) => a.description.trim())
    .map((a) => ({ description: a.description.trim(), competencyTags: a.competencyTags }));

  const updateActivity = (i: number, patch: Partial<LocalActivity>) =>
    setActivities((p) => p.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addTag = (i: number, raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setActivities((p) => p.map((a, j) =>
      (j === i && !a.competencyTags.includes(tag) ? { ...a, competencyTags: [...a.competencyTags, tag] } : a)));
    setTagDrafts((d) => ({ ...d, [i]: '' }));
  };

  /**
   * One save for the day. The narrative goes to the SIWES record and the
   * itemised activities to the week entry — the student sees a single action,
   * which is the point of the merge. Content first: if it fails there is
   * nothing worth writing activities against.
   */
  async function persist(): Promise<string | undefined> {
    setFormErr(null);
    // The week row may not exist yet, in which case the `entryId` prop is still
    // undefined and the save below is what creates it. Track the id locally:
    // `setSavedWeekEntryId` cannot be read back in this same tick, and returning
    // the stale prop meant "Submit day" on the first day of a new week saved the
    // day, returned undefined, and failed with "Could not open this week for
    // submission" — the click read as a save and the day never went in.
    let weekEntryId = entryId;

    if (hasContent) {
      const result = await saveDailyEntry.mutateAsync({
        placementId,
        workDate: day.date,
        descriptionOfWork: description.trim(),
        newSkillsLearnt: skills.trim(),
      });
      // Completing the week does not submit it — the student is asked. Their
      // status must never change under them without a decision.
      setWeekComplete(result.weekComplete);
      setDaysLeftInWeek(result.daysRemainingInWeek);
      setWorkingDaysInWeek(result.workingDaysInWeek);
      setSavedWeekEntryId(result.weekEntryId);
      if (result.weekEntryId) weekEntryId = result.weekEntryId;
    }

    if (activityPayload.length > 0 || weekEntryId) {
      const entry = await saveDay.mutateAsync({
        placementId,
        weekNumber,
        periodStart: bounds.start,
        periodEnd: bounds.end,
        date: day.date,
        activities: activityPayload,
      });
      return entry.id;
    }

    return weekEntryId;
  }

  async function handleSave() {
    if (!hasContent && activityPayload.length === 0) {
      setFormErr('Add what you worked on before saving.');
      return;
    }
    try {
      await persist();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setFormErr(errMessage(e)); }
  }

  async function handleSubmit() {
    if (!hasContent) {
      setFormErr('Both "Description of work done" and "New skills learnt" are required before submitting a day.');
      return;
    }
    try {
      const id = await persist();
      if (!id) { setFormErr('Could not open this week for submission. Please try again.'); return; }
      await submitDay.mutateAsync({ entryId: id, date: day.date });
    } catch (e) { setFormErr(errMessage(e)); }
  }

  const busy = saveDailyEntry.isPending || saveDay.isPending || submitDay.isPending;
  const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:bg-surface-sunken';

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">{fmtDate(day.date)}</h2>
        <div className="flex items-center gap-2">
          {daySubmitted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-semibold text-ok">
              <CheckCircle2 className="h-3 w-3" /> Submitted{day.entry?.loggedLate ? ' · late' : ''}
            </span>
          )}
          {editWindowClosed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
              <Lock className="h-3 w-3" /> Editing closed
            </span>
          )}
        </div>
      </div>

      {day.absence ? (
        <p className="text-sm text-ink-secondary">
          Recorded as {day.absence.kind === 'sick' ? 'sick leave' : `a ${day.absence.kind} absence`}
          {day.absence.reason && <> — {day.absence.reason}</>}.
        </p>
      ) : day.class === 'non_working' ? (
        <p className="flex items-center gap-2 text-sm text-ink-secondary">
          <Sun className="h-4 w-4 text-warn" /> Public holiday — nothing to log.
        </p>
      ) : (
        <>
          {future && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-brand bg-surface-sunken px-3 py-2 text-xs text-brand-ink">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This day hasn't arrived yet (Ghana time) — logging opens on the day itself.
            </div>
          )}
          {!future && !daySubmitted && lateBy > DAY_GRACE_DAYS && editable && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn bg-warn-soft px-3 py-2 text-xs text-warn">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              You're logging this {lateBy} day{lateBy === 1 ? '' : 's'} after the day itself. You can
              still submit it — your supervisor will see it marked
              {' '}<span className="font-semibold">Late — {lateBy} day{lateBy === 1 ? '' : 's'}</span>.
            </div>
          )}

          <fieldset disabled={!editable} className="space-y-3 disabled:opacity-70">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary" htmlFor="lb-work">
                Description of work done
              </label>
              <textarea
                id="lb-work" rows={4} value={description} maxLength={WORK_MAX}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you work on today?"
                aria-invalid={!!descError}
                className={inputCls}
              />
              <FieldError message={descError} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary" htmlFor="lb-skills">
                New skills learnt
              </label>
              <textarea
                id="lb-skills" rows={2} value={skills} maxLength={SKILLS_MAX}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Skills, tools or procedures you picked up"
                aria-invalid={!!skillsError}
                className={inputCls}
              />
              <FieldError message={skillsError} />
            </div>

            {/* Itemised activities — optional detail on the same day, folded away
                by default so the day reads as one form rather than two. */}
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <button
                type="button"
                onClick={() => setShowActivities((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-xs font-semibold text-ink-secondary">
                  Break the day into activities
                  {activities.length > 0 && (
                    <span className="ml-1.5 text-ink-muted">({activities.length})</span>
                  )}
                </span>
                {showActivities
                  ? <ChevronUp className="h-4 w-4 text-ink-muted" />
                  : <ChevronDown className="h-4 w-4 text-ink-muted" />}
              </button>

              {showActivities && (
                <div className="mt-3 space-y-3">
                  {activities.map((a, i) => {
                    const detected = detectCompetencies(a.description, a.competencyTags);
                    return (
                      <div key={i} className="rounded-lg border border-line bg-surface p-3">
                        <div className="mb-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setActivities((p) => p.filter((_, j) => j !== i))}
                            className="rounded-md p-1 text-ink-muted hover:bg-danger-soft hover:text-danger"
                            aria-label="Remove activity"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={2} value={a.description} maxLength={ACTIVITY_MAX}
                          onChange={(e) => updateActivity(i, { description: e.target.value })}
                          placeholder="Describe one activity…"
                          className={`${inputCls} resize-none`}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {a.competencyTags.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-ink">
                              {t}
                              <button
                                type="button"
                                onClick={() => updateActivity(i, { competencyTags: a.competencyTags.filter((x) => x !== t) })}
                                aria-label={`Remove ${t}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text" value={tagDrafts[i] ?? ''}
                            onChange={(e) => setTagDrafts((d) => ({ ...d, [i]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(i, tagDrafts[i] ?? ''); } }}
                            placeholder="+ competency"
                            className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-ink placeholder:text-ink-muted focus:border-line focus:outline-none"
                          />
                        </div>
                        {detected.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-ink">
                              <Sparkles className="h-3 w-3" /> Detected
                            </span>
                            {detected.map((sug) => (
                              <button
                                key={sug} type="button" onClick={() => addTag(i, sug)}
                                className="rounded-full border border-brand bg-surface px-2 py-0.5 text-[11px] font-medium text-brand-ink hover:bg-brand-soft"
                              >
                                + {sug}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {COMPETENCY_SUGGESTIONS
                            .filter((sug) => !a.competencyTags.includes(sug) && !detected.includes(sug))
                            .slice(0, 5)
                            .map((sug) => (
                              <button
                                key={sug} type="button" onClick={() => addTag(i, sug)}
                                className="rounded px-1.5 py-0.5 text-[11px] text-ink-secondary hover:text-brand-ink"
                              >
                                + {sug}
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setActivities((p) => [...p, { description: '', competencyTags: [] }])}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-ink hover:bg-brand-soft"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add activity
                  </button>
                </div>
              )}
            </div>

            {/* Evidence for this day — the first upload opens the week draft. */}
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <EntryAttachments
                entryId={entryId}
                ensureEntryId={async () => {
                  const id = await persist();
                  if (!id) throw new Error('Could not open this week for attachments');
                  return id;
                }}
                date={day.date}
                editable={editable}
              />
            </div>
          </fieldset>

          {/* The week is finished. Ask — do not transition it under them. */}
          {weekComplete && !weekSubmitted && (
            <div className="mt-3 rounded-lg border border-ok bg-ok-soft px-3 py-3">
              <p className="flex items-start gap-2 text-xs font-semibold text-ok">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                That was the last day of this week — all {workingDaysInWeek || 5} days are logged.
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Send it to your supervisor now, or read it over first. Either way it will not be
                counted late: a finished week you have not sent is submitted for you after the grace
                window.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!(savedWeekEntryId ?? entryId) || submitWeek.isPending}
                  onClick={async () => {
                    const id = savedWeekEntryId ?? entryId;
                    if (!id) return;
                    try {
                      await submitWeek.mutateAsync(id);
                      setWeekSubmitted(true);
                    } catch (e) { setFormErr(errMessage(e)); }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {submitWeek.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Submit the week now
                </button>
                <button
                  type="button"
                  onClick={() => setWeekComplete(false)}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:border-line-strong"
                >
                  I'll review it first
                </button>
              </div>
            </div>
          )}
          {weekSubmitted && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand bg-surface-sunken px-3 py-2 text-xs text-brand-ink">
              <Send className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Week sent to your supervisor for review.
            </div>
          )}
          {!weekComplete && !weekSubmitted && daysLeftInWeek !== null && daysLeftInWeek > 0 && weekStatus === 'draft' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand bg-surface-sunken px-3 py-2 text-xs text-brand-ink">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {daysLeftInWeek} more day{daysLeftInWeek === 1 ? '' : 's'} to log and this week is ready to send.
            </div>
          )}

          {formErr && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formErr}
            </div>
          )}

          {editable && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button" onClick={handleSave} disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary hover:border-line-strong hover:text-ink disabled:opacity-60"
              >
                {saved ? <><CheckCircle2 className="h-4 w-4 text-ok" /> Saved</>
                  : busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <><Save className="h-4 w-4" /> Save day</>}
              </button>
              <button
                type="button" onClick={handleSubmit} disabled={busy || !hasContent}
                title={!hasContent ? 'Fill in both fields to submit this day' : ''}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> {daySubmitted ? 'Resubmit day' : 'Submit day'}
              </button>
            </div>
          )}

          {/* Absence self-report — same day, different answer to "what happened". */}
          {canReportAbsence && !absenceOpen && (
            <button
              type="button" onClick={() => setAbsenceOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-danger"
            >
              <CircleSlash className="h-3.5 w-3.5" /> I was absent this day
            </button>
          )}
          {canReportAbsence && absenceOpen && (
            <div className="mt-3 space-y-3 rounded-lg border border-line bg-surface-sunken p-3">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <input type="radio" checked={absenceKind === 'sick'} onChange={() => setAbsenceKind('sick')} /> Sick
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm text-ink">
                  <input type="radio" checked={absenceKind === 'permitted'} onChange={() => setAbsenceKind('permitted')} /> Permitted (with approval)
                </label>
              </div>
              <input
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                maxLength={2000}
                placeholder={absenceKind === 'permitted' ? 'Reason (required)' : 'Reason (optional)'}
                className={inputCls}
              />
              {recordAbsence.isError && (
                <p className="text-xs text-danger">{errMessage(recordAbsence.error)}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => recordAbsence.mutate({
                    placementId,
                    absenceDate: day.date,
                    kind: absenceKind,
                    reason: absenceReason.trim() || undefined,
                  })}
                  disabled={recordAbsence.isPending || (absenceKind === 'permitted' && !absenceReason.trim())}
                  className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-ink-inverse disabled:opacity-50"
                >
                  {recordAbsence.isPending ? 'Recording…' : 'Record absence'}
                </button>
                <button
                  type="button" onClick={() => setAbsenceOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-sunken"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── The week's own narrative ────────────────────────────────────
function WeeklyReportCard({
  placementId, weekNumber, locked, lockReason, summary,
}: {
  placementId: string;
  weekNumber: number;
  locked: boolean;
  lockReason?: string;
  summary: { id: string; weekEnding: string; reportText: string } | undefined;
}) {
  const saveSummary = useSaveWeeklySummary(placementId);
  const [text, setText] = useState(summary?.reportText ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(summary?.reportText ?? '');
    saveSummary.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekNumber, summary?.id]);

  const parsed = text.trim() ? reportText.safeParse(text) : null;
  const error = parsed && !parsed.success ? parsed.error.issues[0]?.message : undefined;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Weekly report</h2>
        {summary && (
          <span className="text-[11px] text-ink-muted">
            Week ending {fmtDate(summary.weekEnding.slice(0, 10))}
          </span>
        )}
      </div>
      <textarea
        rows={3} value={text} maxLength={REPORT_MAX} disabled={locked}
        onChange={(e) => setText(e.target.value)}
        placeholder="Summarise the week's work in your own words"
        aria-invalid={!!error}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none disabled:bg-surface-sunken"
      />
      <FieldError message={error} />
      {lockReason && <p className="mt-1 text-xs text-ink-muted">{lockReason}</p>}
      {saveSummary.isError && (
        <p className="mt-1 text-xs text-danger">{errMessage(saveSummary.error)}</p>
      )}
      {!locked && (
        <button
          type="button"
          onClick={async () => {
            try {
              await saveSummary.mutateAsync({ placementId, weekNumber, reportText: text.trim() });
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            } catch { /* surfaced above */ }
          }}
          disabled={!text.trim() || !!error || saveSummary.isPending}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse disabled:opacity-50"
        >
          {saveSummary.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
            : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : summary ? 'Update report' : 'Save report'}
        </button>
      )}
    </div>
  );
}

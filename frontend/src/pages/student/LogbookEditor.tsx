import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, Plus, X, Trash2, CheckCircle2, Clock, RotateCcw, Send,
  Calendar, AlertCircle, BookOpen, Sparkles, ChevronRight, ChevronLeft, ShieldCheck,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useEntries, useEntry, useSaveDay, useSubmitDay,
  type EntryStatus, type DayStatus,
} from '@/hooks/useEntries';
import { EntryAttachments } from '@/components/attachments/EntryAttachments';
import {
  type ScheduleWeek, buildSchedule, toYMD, ghanaYMD, ymd, fmtRange, fmtDate, addDaysYMD,
} from '@/lib/schedule';

// Grace window: a day logged within this many days of its date is on time.
// Later days can still be logged, but are flagged late to the supervisor
// (mirrors the backend DAY_GRACE_DAYS rule).
const DAY_GRACE_DAYS = 2;

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

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayCell { ymd: string; dow: number; dom: number; }

// Mon–Fri working days of a schedule week (weekends excluded from the logbook).
function buildDays(week: ScheduleWeek): DayCell[] {
  const start = new Date(`${week.periodStart}T00:00:00Z`);
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDaysYMD(start, i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    cells.push({ ymd: toYMD(d), dow, dom: d.getUTCDate() });
  }
  return cells;
}

// Client-side mirror of the backend window, anchored on Ghana time: only
// future days are blocked. Past days are always loggable — beyond the grace
// window they're flagged late.
function dayWindow(dateYMD: string): { future: boolean; blocked: boolean; lateBy: number } {
  const today = new Date(`${ghanaYMD()}T00:00:00Z`).getTime();
  const date = new Date(`${dateYMD}T00:00:00Z`).getTime();
  const lateBy = Math.round((today - date) / 86_400_000);
  return { future: lateBy < 0, blocked: lateBy < 0, lateBy };
}

type LocalActivity = { description: string; competencyTags: string[] };

const WEEK_STATUS_META: Record<EntryStatus | 'not_started' | 'upcoming', { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]', Icon: Calendar },
  upcoming:     { label: 'Upcoming',     cls: 'bg-[var(--h-eef0f5)] text-[var(--h-94a3b8)]', Icon: Clock },
  draft:        { label: 'In progress',  cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]', Icon: Clock },
  submitted:    { label: 'In review',    cls: 'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)]', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)]', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]', Icon: CheckCircle2 },
};

function WeekStatusPill({ status }: { status: EntryStatus | 'not_started' | 'upcoming' }) {
  const { label, cls, Icon } = WEEK_STATUS_META[status] ?? WEEK_STATUS_META.not_started;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export default function LogbookEditor() {
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];

  const { data: entries = [], isLoading: entriesLoading } = useEntries(activePlacement?.id);
  const schedule = useMemo(() => buildSchedule(activePlacement?.startDate ?? null), [activePlacement?.startDate]);

  const entryByWeek = useMemo(() => {
    const m = new Map<number, (typeof entries)[number]>();
    entries.forEach((e) => m.set(e.weekNumber, e));
    return m;
  }, [entries]);

  const [searchParams] = useSearchParams();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Honour a ?week= deep-link once on load (from the dashboard table).
  useEffect(() => {
    if (selectedWeek !== null || schedule.length === 0) return;
    const want = Number(searchParams.get('week'));
    if (schedule.some((w) => w.weekNumber === want)) setSelectedWeek(want);
  }, [schedule, selectedWeek, searchParams]);

  const scheduleWeek = schedule.find((w) => w.weekNumber === selectedWeek);
  const weekEntry = selectedWeek != null ? entryByWeek.get(selectedWeek) : undefined;
  const { data: detail } = useEntry(weekEntry?.id);

  // ── Loading / empty states ──
  if (placementsLoading || entriesLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" /></div>;
  }
  if (!activePlacement) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--h-8a4cfc)]" />
        <h2 className="mb-1 text-lg font-bold text-[var(--h-0b1c30)]">No active placement</h2>
        <p className="text-sm text-[var(--h-464652)]">Your logbook opens once your placement is approved.</p>
      </div>
    );
  }
  if (schedule.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <Calendar className="mx-auto mb-4 h-12 w-12 text-[var(--h-8a4cfc)]" />
        <h2 className="mb-1 text-lg font-bold text-[var(--h-0b1c30)]">Your placement hasn't started yet</h2>
        <p className="text-sm text-[var(--h-464652)]">
          {activePlacement.startDate
            ? <>The first logbook week opens on <span className="font-semibold">{fmtDate(activePlacement.startDate)}</span>.</>
            : 'The first logbook week opens on the placement start date.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Logbook</h1>
        <p className="mt-0.5 text-sm text-[var(--h-464652)]">
          {activePlacement.company?.name ?? 'Your placement'} · log each working day
        </p>
      </div>

      {selectedWeek == null || !scheduleWeek ? (
        <WeekTable schedule={schedule} entryByWeek={entryByWeek} onPick={(w) => { setSelectedWeek(w); setSelectedDay(null); }} />
      ) : selectedDay == null ? (
        <DayGrid
          week={scheduleWeek}
          weekStatus={(weekEntry?.status as EntryStatus) ?? 'not_started'}
          detail={detail}
          onBack={() => setSelectedWeek(null)}
          onPick={setSelectedDay}
        />
      ) : (
        <DayForm
          key={selectedDay}
          placementId={activePlacement.id}
          week={scheduleWeek}
          date={selectedDay}
          weekEntry={weekEntry}
          detail={detail}
          onBack={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ── Level 1 — weeks 1–6 ───────────────────────────────────────
function WeekTable({
  schedule, entryByWeek, onPick,
}: {
  schedule: ScheduleWeek[];
  entryByWeek: Map<number, { id: string; status: EntryStatus; days?: { status: DayStatus }[] }>;
  onPick: (week: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--h-e2e6ef)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">
            <th className="px-5 py-3">Week</th>
            <th className="px-5 py-3">Dates</th>
            <th className="px-5 py-3 text-center">Days submitted</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody>
          {schedule.map((w) => {
            const e = entryByWeek.get(w.weekNumber);
            const submitted = (e?.days ?? []).filter((d) => d.status === 'submitted').length;
            const status: EntryStatus | 'not_started' | 'upcoming' =
              e?.status ?? (w.upcoming ? 'upcoming' : 'not_started');
            return (
              <tr
                key={w.weekNumber}
                onClick={() => onPick(w.weekNumber)}
                className="cursor-pointer border-b border-[var(--h-f0f2f7)] transition-colors last:border-0 hover:bg-[var(--h-f8f9ff)]"
              >
                <td className="px-5 py-3.5 font-semibold text-[var(--h-0b1c30)]">Week {w.label}</td>
                <td className="px-5 py-3.5 text-[var(--h-64748b)]">{fmtRange(w.periodStart, w.periodEnd)}</td>
                <td className="px-5 py-3.5 text-center font-medium text-[var(--h-0b1c30)]">{submitted}/5</td>
                <td className="px-5 py-3.5"><WeekStatusPill status={status} /></td>
                <td className="px-5 py-3.5 text-right"><ChevronRight className="inline h-4 w-4 text-[var(--h-94a3b8)]" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Level 2 — Mon–Fri of one week ─────────────────────────────
function DayGrid({
  week, weekStatus, detail, onBack, onPick,
}: {
  week: ScheduleWeek;
  weekStatus: EntryStatus | 'not_started';
  detail: { days?: { date: string; status: DayStatus; loggedLate: boolean }[]; activities?: { activityDate: string }[] } | undefined;
  onBack: () => void;
  onPick: (ymd: string) => void;
}) {
  const days = buildDays(week);
  const dayByDate = new Map((detail?.days ?? []).map((d) => [ymd(d.date), d]));
  const actCount = new Map<string, number>();
  (detail?.activities ?? []).forEach((a) => {
    const k = ymd(a.activityDate);
    actCount.set(k, (actCount.get(k) ?? 0) + 1);
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--h-15157d)] hover:underline">
        <ChevronLeft className="h-4 w-4" /> All weeks
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">Week {week.label}</h2>
          <p className="text-sm text-[var(--h-464652)]">{fmtRange(week.periodStart, week.periodEnd)}</p>
        </div>
        <WeekStatusPill status={weekStatus} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map((d) => {
          const day = dayByDate.get(d.ymd);
          const n = actCount.get(d.ymd) ?? 0;
          const w = dayWindow(d.ymd);
          const submitted = day?.status === 'submitted';
          const missed = !submitted && !w.future && w.lateBy > DAY_GRACE_DAYS; // still loggable, flagged late
          return (
            <button
              key={d.ymd}
              onClick={() => onPick(d.ymd)}
              className={`rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-4 text-left transition-colors ${w.future ? 'opacity-60 hover:border-[var(--h-d8dce6)]' : 'hover:border-[var(--h-8a4cfc)]'}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--h-0b1c30)]">{WEEKDAY_LONG[d.dow]}</span>
                {submitted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-dcf5e6)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-1b7a45)]">
                    <CheckCircle2 className="h-3 w-3" /> Submitted
                  </span>
                ) : w.future ? (
                  <span className="rounded-full bg-[var(--h-eef0f5)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-94a3b8)]">Upcoming</span>
                ) : missed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-fff4e0)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-9a6700)]"><AlertCircle className="h-3 w-3" /> Log late</span>
                ) : n > 0 ? (
                  <span className="rounded-full bg-[var(--h-fff4e0)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-9a6700)]">Draft</span>
                ) : (
                  <span className="rounded-full bg-[var(--h-eef0f5)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-94a3b8)]">Not logged</span>
                )}
              </div>
              <p className="text-xs text-[var(--h-64748b)]">{fmtDate(d.ymd)}</p>
              <p className="mt-2 text-xs text-[var(--h-94a3b8)]">
                {n > 0 ? `${n} ${n === 1 ? 'activity' : 'activities'}` : w.future ? 'Locked until the day arrives' : 'Tap to log this day'}
                {day?.loggedLate && <span className="ml-1 text-[var(--h-9a6700)]">· logged late</span>}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Level 3 — log one day ─────────────────────────────────────
function DayForm({
  placementId, week, date, weekEntry, detail, onBack,
}: {
  placementId: string;
  week: ScheduleWeek;
  date: string;
  weekEntry: { id: string; status: EntryStatus } | undefined;
  detail: { id?: string; status?: EntryStatus; days?: { date: string; status: DayStatus; loggedLate: boolean }[]; activities?: { activityDate: string; description: string; competencyTags: string[] }[] } | undefined;
  onBack: () => void;
}) {
  const saveDay = useSaveDay();
  const submitDay = useSubmitDay();

  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const win = dayWindow(date);

  const dayRecord = (detail?.days ?? []).find((d) => ymd(d.date) === date);
  const weekStatus = (weekEntry?.status ?? detail?.status) as EntryStatus | undefined;
  const daySubmitted = dayRecord?.status === 'submitted';
  // Editable unless the day hasn't arrived yet (Ghana time), the week is
  // acknowledged, or this day is already submitted (and the week wasn't
  // returned for revision).
  const editable = !win.future
    && weekStatus !== 'acknowledged'
    && (!daySubmitted || weekStatus === 'returned');

  const seeded = useMemo<LocalActivity[]>(
    () => (detail?.activities ?? [])
      .filter((a) => ymd(a.activityDate) === date)
      .map((a) => ({ description: a.description, competencyTags: a.competencyTags ?? [] })),
    [detail?.activities, date],
  );

  const [activities, setActivities] = useState<LocalActivity[]>(seeded);
  const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when the loaded day content arrives/changes.
  useEffect(() => { setActivities(seeded); setSaved(false); setError(null); setTagDrafts({}); }, [seeded]);

  const updateActivity = (i: number, patch: Partial<LocalActivity>) =>
    setActivities((p) => p.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addActivity = () => setActivities((p) => [...p, { description: '', competencyTags: [] }]);
  const removeActivity = (i: number) => setActivities((p) => p.filter((_, j) => j !== i));
  const addTag = (i: number, raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setActivities((p) => p.map((a, j) => (j === i && !a.competencyTags.includes(tag) ? { ...a, competencyTags: [...a.competencyTags, tag] } : a)));
    setTagDrafts((d) => ({ ...d, [i]: '' }));
  };
  const removeTag = (i: number, tag: string) =>
    updateActivity(i, { competencyTags: activities[i].competencyTags.filter((t) => t !== tag) });

  const payload = useCallback(() => ({
    placementId, weekNumber: week.weekNumber, periodStart: week.periodStart, periodEnd: week.periodEnd, date,
    activities: activities.filter((a) => a.description.trim()).map((a) => ({ description: a.description.trim(), competencyTags: a.competencyTags })),
  }), [placementId, week, date, activities]);

  const apiErr = (e: unknown) =>
    ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ?? 'Something went wrong. Please try again.';

  // Save draft — only when the user clicks (no autosave).
  const handleSave = async () => {
    setError(null);
    try {
      await saveDay.mutateAsync(payload());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(apiErr(e)); }
  };

  // Submit this day — saves the current content first so nothing is lost, then
  // submits. Stays on the page; the day flips to a read-only submitted view.
  const handleSubmit = async () => {
    setError(null);
    try {
      const entry = await saveDay.mutateAsync(payload());
      await submitDay.mutateAsync({ entryId: entry.id, date });
    } catch (e) { setError(apiErr(e)); }
  };

  const busy = saveDay.isPending || submitDay.isPending;
  const inputCls = 'w-full rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]';

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--h-15157d)] hover:underline">
        <ChevronLeft className="h-4 w-4" /> Week {week.label}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">{WEEKDAY_LONG[dow]}</h2>
          <p className="text-sm text-[var(--h-464652)]">{fmtDate(date)}</p>
        </div>
        {daySubmitted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-dcf5e6)] px-2.5 py-1 text-xs font-semibold text-[var(--h-1b7a45)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Submitted{dayRecord?.loggedLate ? ' · late' : ''}
          </span>
        )}
      </div>

      {/* Anti-cheat / status banners */}
      {!daySubmitted && win.future && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--h-bcc8ff)] bg-[var(--h-eef1ff)] px-4 py-3 text-sm text-[var(--h-15157d)]">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" /> This day hasn't arrived yet (Ghana time) — logging opens on the day itself. It's locked until then.
        </div>
      )}
      {!daySubmitted && weekStatus === 'acknowledged' && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-eef0f5)] px-4 py-3 text-sm text-[var(--h-464652)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> This week has been acknowledged by your supervisor and is locked — days can no longer be added or edited.
        </div>
      )}
      {!daySubmitted && !win.future && weekStatus !== 'acknowledged' && win.lateBy > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--h-f3d690)] bg-[var(--h-fff4e0)] px-4 py-3 text-sm text-[var(--h-9a6700)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> You're logging this {win.lateBy} day{win.lateBy === 1 ? '' : 's'} late — you can still submit it, but it will be flagged as late for your supervisor.
        </div>
      )}
      {daySubmitted && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--h-aee3c2)] bg-[var(--h-e9f9ef)] px-4 py-3 text-sm text-[var(--h-1b7a45)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> This day is submitted{weekStatus === 'returned' ? ', but the week was returned — you can edit and resubmit.' : ' and visible to your supervisor.'}
        </div>
      )}

      <fieldset disabled={!editable} className="space-y-4 disabled:opacity-70">
        {/* Activities for this day */}
        <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--h-0b1c30)]">What did you work on?</h3>
              <p className="text-xs text-[var(--h-64748b)]">Log each activity for this day</p>
            </div>
            {editable && (
              <button type="button" onClick={addActivity} className="inline-flex items-center gap-1 rounded-lg bg-[var(--h-f1ecff)] px-3 py-1.5 text-sm font-medium text-[var(--h-712ae2)] hover:bg-[var(--h-e6dcff)]">
                <Plus className="h-4 w-4" /> Add activity
              </button>
            )}
          </div>

          <div className="space-y-4">
            {activities.length === 0 && (
              editable ? (
                <button type="button" onClick={addActivity} className="w-full rounded-lg border border-dashed border-[var(--h-d8dce6)] py-7 text-center text-sm text-[var(--h-94a3b8)] hover:border-[var(--h-8a4cfc)] hover:text-[var(--h-712ae2)]">
                  Nothing logged yet — tap to add an activity.
                </button>
              ) : (
                <p className="w-full rounded-lg border border-dashed border-[var(--h-d8dce6)] py-7 text-center text-sm text-[var(--h-94a3b8)]">
                  Nothing was logged for this day.
                </p>
              )
            )}
            {activities.map((a, i) => {
              const detected = detectCompetencies(a.description, a.competencyTags);
              return (
                <div key={i} className="rounded-lg border border-[var(--h-e8ebf2)] bg-[var(--h-fbfcfe)] p-4">
                  <div className="mb-2 flex justify-end">
                    <button type="button" onClick={() => removeActivity(i)} className="rounded-md p-1.5 text-[var(--h-94a3b8)] hover:bg-[var(--h-ffe2dc)] hover:text-[var(--h-b3261e)]" aria-label="Remove activity">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea rows={2} value={a.description} onChange={(e) => updateActivity(i, { description: e.target.value })} placeholder="Describe what you did…" className={`${inputCls} resize-none`} />
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {a.competencyTags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--h-e1e8ff)] px-2 py-0.5 text-xs font-medium text-[var(--h-15157d)]">
                        {t}
                        <button type="button" onClick={() => removeTag(i, t)} aria-label={`Remove ${t}`}><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <input type="text" value={tagDrafts[i] ?? ''} onChange={(e) => setTagDrafts((d) => ({ ...d, [i]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(i, tagDrafts[i] ?? ''); } }}
                      placeholder="+ competency" className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-d8dce6)] focus:outline-none" />
                  </div>
                  {detected.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--h-f1ecff)] px-2 py-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--h-712ae2)]"><Sparkles className="h-3 w-3" /> Detected</span>
                      {detected.map((s) => (
                        <button key={s} type="button" onClick={() => addTag(i, s)} className="rounded-full border border-[var(--h-d3c4ff)] bg-[var(--h-ffffff)] px-2 py-0.5 text-[11px] font-medium text-[var(--h-712ae2)] hover:bg-[var(--h-e6dcff)]">+ {s}</button>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {COMPETENCY_SUGGESTIONS.filter((s) => !a.competencyTags.includes(s) && !detected.includes(s)).slice(0, 5).map((s) => (
                      <button key={s} type="button" onClick={() => addTag(i, s)} className="rounded px-1.5 py-0.5 text-[11px] text-[var(--h-64748b)] hover:text-[var(--h-712ae2)]">+ {s}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evidence for THIS day — available once the week exists (after first save). */}
        {detail?.id && (
          <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
            <EntryAttachments entryId={detail.id} date={date} editable={editable} />
          </div>
        )}
      </fieldset>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--h-f5b8ad)] bg-[var(--h-fff1ee)] px-4 py-3 text-sm text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleSave} disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-4 py-2.5 text-sm font-medium text-[var(--h-464652)] hover:border-[var(--h-b9c0d0)] hover:text-[var(--h-0b1c30)] disabled:opacity-60">
            {saved ? <><CheckCircle2 className="h-4 w-4 text-[var(--h-1b7a45)]" /> Saved</> : saveDay.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save draft'}
          </button>
          <button type="button" onClick={handleSubmit} disabled={busy || win.blocked}
            title={win.blocked ? 'You can submit this day once it arrives' : ''}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60">
            {submitDay.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> {daySubmitted ? 'Resubmit day' : 'Submit day'}</>}
          </button>
        </div>
      )}
    </div>
  );
}

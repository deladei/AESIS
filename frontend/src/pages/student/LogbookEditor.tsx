import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, X, Trash2, CheckCircle2, Clock, RotateCcw, Lock,
  Send, Calendar, AlertCircle, BookOpen, Sparkles, Cloud, CloudOff,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useEntries, useEntry, useSaveEntryDraft, useSubmitEntry,
  type EntryStatus, type EntryActivity,
} from '@/hooks/useEntries';
import { EntryObjectives } from '@/components/objectives/EntryObjectives';
import { EntryAttachments } from '@/components/attachments/EntryAttachments';
import {
  type ScheduleWeek, buildSchedule, toYMD, localYMD, ymd, fmtRange, fmtDate, addDaysYMD,
} from '@/lib/schedule';

const COMPETENCY_SUGGESTIONS = [
  'Problem Solving', 'Teamwork', 'Communication', 'Technical Writing',
  'Debugging', 'Version Control', 'Testing', 'Code Review', 'Time Management',
];

// Local, zero-cost competency detection. Scans what the student actually typed
// and surfaces matching competencies inline — no AI call, no latency, no spend.
// Advisory only: the student still taps to confirm before a tag is added.
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
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayCell { ymd: string; dow: number; dom: number; }

// Expand a schedule week into its working days only — Mon–Fri (weekends excluded
// from the logbook). Anchored on periodStart, scanning the full 7-day span.
function buildDays(week: ScheduleWeek): DayCell[] {
  const start = new Date(`${week.periodStart}T00:00:00Z`);
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDaysYMD(start, i);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip Sun/Sat
    cells.push({ ymd: toYMD(d), dow, dom: d.getUTCDate() });
  }
  return cells;
}

// Default the active day to today when today is a working day inside the week;
// otherwise fall back to the week's first weekday.
function defaultDay(week: ScheduleWeek): string {
  const days = buildDays(week);
  const today = localYMD(new Date());
  if (days.some((d) => d.ymd === today)) return today;
  return days[0]?.ymd ?? week.periodStart;
}

const STATUS_META: Record<EntryStatus | 'not_started', { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)] border-[var(--h-d8dce6)]', Icon: Calendar },
  draft:        { label: 'Draft',        cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)] border-[var(--h-f3d690)]', Icon: Clock },
  submitted:    { label: 'Submitted',    cls: 'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)] border-[var(--h-bcc8ff)]', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)] border-[var(--h-f5b8ad)]', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)] border-[var(--h-aee3c2)]', Icon: CheckCircle2 },
};

function StatusPill({ status }: { status: EntryStatus | 'not_started' }) {
  // Tolerate an unknown/stale status — fall back to neutral, never throw.
  const { label, cls, Icon } = STATUS_META[status] ?? STATUS_META.not_started;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

// ── Completeness ring ──────────────────────────────────────────────────────
// Live, weighted progress that nudges the student toward a strong week without
// implying a grade. Pure presentation over data already in the form.
const RING_MSG: { min: number; text: string }[] = [
  { min: 100, text: "Picture-perfect week — ready to submit." },
  { min: 75,  text: 'Almost there — add a finishing touch.' },
  { min: 40,  text: 'Good momentum — keep filling it in.' },
  { min: 1,   text: 'Nice start — every detail counts.' },
  { min: 0,   text: 'Pick a day and log your first activity.' },
];

function CompletenessRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const tone =
    pct >= 100 ? 'var(--h-1b7a45)' : pct >= 40 ? 'var(--h-8a4cfc)' : 'var(--h-9a6700)';
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--h-eef0f5)" strokeWidth="7" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`} className="transition-all duration-500 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-[var(--h-0b1c30)]">
        {pct}%
      </span>
    </div>
  );
}

const emptyActivity = (date: string): EntryActivity => ({
  activityDate: date, description: '', competencyTags: [],
});

// Stable serialization of the editable form — used to detect real changes so
// autosave fires only on genuine edits (and never loops on reloaded data).
function serializeForm(
  hours: string, activities: EntryActivity[], learning: string,
  challenges: string, supervisorVisible: boolean,
): string {
  return JSON.stringify({
    hours: hours.trim(),
    activities: activities
      .map((a) => ({ d: a.activityDate, t: a.description.trim(), c: [...a.competencyTags].sort() }))
      .filter((a) => a.t.length > 0),
    learning: learning.trim(),
    challenges: challenges.trim(),
    supervisorVisible,
  });
}

export default function LogbookEditor() {
  const navigate = useNavigate();

  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement =
    placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];

  const { data: entries = [], isLoading: entriesLoading } = useEntries(activePlacement?.id);

  const schedule = useMemo(
    () => buildSchedule(activePlacement?.startDate ?? null),
    [activePlacement?.startDate],
  );

  // Index existing entries by week for overlay onto the schedule.
  const entryByWeek = useMemo(() => {
    const m = new Map<number, (typeof entries)[number]>();
    entries.forEach((e) => m.set(e.weekNumber, e));
    return m;
  }, [entries]);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Default to the latest week once the schedule is known.
  useEffect(() => {
    if (selectedWeek === null && schedule.length > 0) {
      setSelectedWeek(schedule[schedule.length - 1].weekNumber);
    }
  }, [schedule, selectedWeek]);

  const scheduleWeek = schedule.find((w) => w.weekNumber === selectedWeek);
  const existing = selectedWeek != null ? entryByWeek.get(selectedWeek) : undefined;
  const { data: detail } = useEntry(existing?.id);

  // ── Form state for the selected week ──
  const [hours, setHours] = useState('');
  const [activities, setActivities] = useState<EntryActivity[]>([]);
  const [learning, setLearning] = useState('');
  const [challenges, setChallenges] = useState('');
  const [supervisorVisible, setSupervisorVisible] = useState(true);
  const [tagDrafts, setTagDrafts] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Day rail + autosave bookkeeping.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const baselineRef = useRef<string>(''); // serialized last-persisted form

  const saveDraft = useSaveEntryDraft();
  const submitEntry = useSubmitEntry();

  // Repopulate the form whenever the selected week (or its loaded detail) changes.
  useEffect(() => {
    if (!scheduleWeek) return;
    setError(null);
    setSaved(false);
    setTagDrafts({});
    setSelectedDay(defaultDay(scheduleWeek));
    setLastSavedAt(null);

    let nextHours = '';
    let nextActs: EntryActivity[] = [];
    let nextLearning = '';
    let nextChallenges = '';
    let nextVisible = true;

    if (detail && detail.weekNumber === selectedWeek) {
      nextHours = detail.hoursLogged != null ? String(detail.hoursLogged) : '';
      nextActs = (detail.activities ?? []).map((a) => ({
        activityDate: ymd(a.activityDate),
        description: a.description,
        competencyTags: a.competencyTags ?? [],
      }));
      nextLearning = detail.reflection?.learning ?? '';
      nextChallenges = detail.reflection?.challenges ?? '';
      nextVisible = detail.reflection?.supervisorVisible ?? true;
    } else if (!existing) {
      nextActs = []; // start empty — the day rail invites the first activity
    }

    setHours(nextHours);
    setActivities(nextActs);
    setLearning(nextLearning);
    setChallenges(nextChallenges);
    setSupervisorVisible(nextVisible);
    // Seed the baseline so autosave doesn't fire on freshly loaded data.
    baselineRef.current = serializeForm(nextHours, nextActs, nextLearning, nextChallenges, nextVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, detail?.id, detail?.version]);

  const status: EntryStatus | 'not_started' = existing?.status ?? 'not_started';
  const editable = status === 'not_started' || status === 'draft' || status === 'returned';
  const busy = saveDraft.isPending || submitEntry.isPending;

  const returnComment = useMemo(() => {
    if (status !== 'returned' || !detail?.events) return null;
    const ev = [...detail.events].reverse().find((e) => e.toStatus === 'returned');
    return ev?.comment ?? null;
  }, [status, detail?.events]);

  // ── Activity row mutations ──
  const updateActivity = (i: number, patch: Partial<EntryActivity>) =>
    setActivities((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addActivity = () =>
    setActivities((prev) => [
      ...prev,
      emptyActivity(selectedDay ?? (scheduleWeek ? defaultDay(scheduleWeek) : toYMD(new Date()))),
    ]);
  const removeActivity = (idx: number) =>
    setActivities((prev) => prev.filter((_, j) => j !== idx));
  const addTag = (i: number, raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setActivities((prev) =>
      prev.map((a, j) =>
        j === i && !a.competencyTags.includes(tag)
          ? { ...a, competencyTags: [...a.competencyTags, tag] }
          : a,
      ),
    );
    setTagDrafts((d) => ({ ...d, [i]: '' }));
  };
  const removeTag = (i: number, tag: string) =>
    updateActivity(i, { competencyTags: activities[i].competencyTags.filter((t) => t !== tag) });

  const buildPayload = useCallback(() => {
    if (!activePlacement || !scheduleWeek) return null;
    const cleanActivities = activities
      .filter((a) => a.description.trim().length > 0)
      .map((a) => ({
        activityDate: a.activityDate,
        description: a.description.trim(),
        competencyTags: a.competencyTags,
      }));
    return {
      placementId: activePlacement.id,
      weekNumber: scheduleWeek.weekNumber,
      periodStart: scheduleWeek.periodStart,
      periodEnd: scheduleWeek.periodEnd,
      hoursLogged: hours.trim() ? Number(hours) : undefined,
      activities: cleanActivities,
      reflection:
        learning.trim() || challenges.trim()
          ? { learning: learning.trim(), challenges: challenges.trim(), supervisorVisible }
          : undefined,
    };
  }, [activePlacement, scheduleWeek, activities, hours, learning, challenges, supervisorVisible]);

  const apiErr = (e: unknown) =>
    ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
    'Something went wrong. Please try again.';

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setError(null);
    try {
      await saveDraft.mutateAsync(payload);
      baselineRef.current = serializeForm(hours, activities, learning, challenges, supervisorVisible);
      setLastSavedAt(Date.now());
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(apiErr(e));
    }
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    if (!payload) return;
    if (payload.activities.length === 0) {
      setError('Add at least one activity before submitting this week.');
      return;
    }
    setError(null);
    try {
      const entry = await saveDraft.mutateAsync(payload); // upsert first, get id
      await submitEntry.mutateAsync(entry.id);
      navigate('/student/submissions');
    } catch (e) {
      setError(apiErr(e));
    }
  };

  // ── Debounced autosave ──
  // Fires ~1.6s after the student stops typing, only on genuine edits with real
  // content. Kills the lost-work risk without a Save click. Manual Save/Submit
  // still work and reset the same baseline.
  const hasContent =
    activities.some((a) => a.description.trim()) || hours.trim() !== '' ||
    learning.trim() !== '' || challenges.trim() !== '';

  useEffect(() => {
    if (!editable || busy) return;
    const current = serializeForm(hours, activities, learning, challenges, supervisorVisible);
    if (current === baselineRef.current || !hasContent) return;
    const t = setTimeout(async () => {
      const payload = buildPayload();
      if (!payload) return;
      try {
        await saveDraft.mutateAsync(payload);
        baselineRef.current = current;
        setLastSavedAt(Date.now());
      } catch {
        /* silent — manual Save surfaces errors */
      }
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, activities, learning, challenges, supervisorVisible, editable, busy]);

  // ── Derived view data ──
  const days = useMemo(() => (scheduleWeek ? buildDays(scheduleWeek) : []), [scheduleWeek]);

  // Activities bucketed by day for the rail's dots/counts.
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    activities.forEach((a) => {
      if (a.description.trim()) m.set(a.activityDate, (m.get(a.activityDate) ?? 0) + 1);
    });
    return m;
  }, [activities]);

  // The day's activities, paired with their index into the full array so edits
  // write back to the right row.
  const dayActivities = useMemo(
    () => activities.map((a, i) => ({ a, i })).filter((x) => x.a.activityDate === selectedDay),
    [activities, selectedDay],
  );

  const daysLogged = countByDay.size;

  // Weighted completeness over what's already typed (advisory, not a grade).
  const completeness = useMemo(() => {
    let pct = 0;
    if (Number(hours) > 0) pct += 25;
    if (activities.some((a) => a.description.trim())) pct += 35;
    if (learning.trim()) pct += 20;
    if (challenges.trim()) pct += 10;
    if (activities.some((a) => a.competencyTags.length > 0)) pct += 10;
    return pct;
  }, [hours, activities, learning, challenges]);
  const ringMsg = RING_MSG.find((m) => completeness >= m.min)?.text ?? '';

  // ── Loading / empty states ──
  if (placementsLoading || entriesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
      </div>
    );
  }

  if (!activePlacement) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--h-8a4cfc)]" />
        <h2 className="mb-1 text-lg font-bold text-[var(--h-0b1c30)]">No active placement</h2>
        <p className="text-sm text-[var(--h-464652)]">
          Your logbook opens once your placement is approved. Check back after coordinator approval.
        </p>
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
            ? <>The first logbook week opens on <span className="font-semibold text-[var(--h-0b1c30)]">{fmtDate(activePlacement.startDate)}</span>, your placement start date.</>
            : 'The first logbook week opens on the placement start date.'}
        </p>
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] transition-colors focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]';

  const selectedDow = selectedDay ? new Date(`${selectedDay}T00:00:00Z`).getUTCDay() : 1;

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Logbook</h1>
        <p className="mt-0.5 text-sm text-[var(--h-464652)]">
          {activePlacement.company?.name ?? 'Your placement'} · weekly entries
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Week rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)]">
            <div className="border-b border-[var(--h-e2e6ef)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">
              Weeks
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {[...schedule].reverse().map((w) => {
                const e = entryByWeek.get(w.weekNumber);
                const st: EntryStatus | 'not_started' = (e?.status as EntryStatus) ?? 'not_started';
                const active = w.weekNumber === selectedWeek;
                return (
                  <button
                    key={w.weekNumber}
                    onClick={() => setSelectedWeek(w.weekNumber)}
                    className={`flex w-full items-center justify-between gap-2 border-b border-[var(--h-f0f2f7)] px-4 py-3 text-left transition-colors last:border-0 ${
                      active ? 'bg-[var(--h-f1ecff)]' : 'hover:bg-[var(--h-f8f9ff)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${active ? 'text-[var(--h-15157d)]' : 'text-[var(--h-0b1c30)]'}`}>
                        Week {w.label}
                      </p>
                      <p className="truncate text-[11px] text-[var(--h-64748b)]">{fmtRange(w.periodStart, w.periodEnd)}</p>
                    </div>
                    <StatusPill status={st} />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Editor */}
        {scheduleWeek && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">Week {scheduleWeek.label}</h2>
                <p className="text-sm text-[var(--h-464652)]">{fmtRange(scheduleWeek.periodStart, scheduleWeek.periodEnd)}</p>
              </div>
              <StatusPill status={status} />
            </div>

            {/* Completeness banner — live progress over the form */}
            {editable && (
              <div className="flex items-center gap-4 rounded-xl border border-[var(--h-e2e6ef)] bg-gradient-to-br from-[var(--h-faf8ff)] to-[var(--h-ffffff)] p-4">
                <CompletenessRing pct={completeness} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--h-0b1c30)]">{ringMsg}</p>
                  <p className="mt-0.5 text-xs text-[var(--h-64748b)]">
                    {daysLogged > 0
                      ? <>{daysLogged} {daysLogged === 1 ? 'day' : 'days'} logged · {activities.filter((a) => a.description.trim()).length} {activities.filter((a) => a.description.trim()).length === 1 ? 'activity' : 'activities'} this week</>
                      : 'Hours, activities, reflection and competencies each add to your week.'}
                  </p>
                </div>
                {/* Autosave indicator */}
                <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--h-64748b)] sm:flex">
                  {saveDraft.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                  ) : lastSavedAt ? (
                    <><Cloud className="h-3.5 w-3.5 text-[var(--h-1b7a45)]" /> Saved</>
                  ) : (
                    <><CloudOff className="h-3.5 w-3.5" /> Not saved yet</>
                  )}
                </div>
              </div>
            )}

            {/* Status banners */}
            {status === 'submitted' && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--h-bcc8ff)] bg-[var(--h-eef1ff)] px-4 py-3 text-sm text-[var(--h-15157d)]">
                <Send className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This week is submitted and awaiting your supervisor's review. It's read-only until they respond.</span>
              </div>
            )}
            {status === 'acknowledged' && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--h-aee3c2)] bg-[var(--h-e9f9ef)] px-4 py-3 text-sm text-[var(--h-1b7a45)]">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Your supervisor acknowledged this week. It's finalized and locked.</span>
              </div>
            )}
            {status === 'returned' && (
              <div className="rounded-lg border border-[var(--h-f5b8ad)] bg-[var(--h-fff1ee)] px-4 py-3 text-sm text-[var(--h-b3261e)]">
                <div className="flex items-center gap-2 font-semibold">
                  <RotateCcw className="h-4 w-4" /> Returned for revision
                </div>
                {returnComment && <p className="mt-1 pl-6 text-[var(--h-7a2018)]">"{returnComment}"</p>}
                <p className="mt-1 pl-6 text-[var(--h-7a2018-80)]">Edit your entry below and resubmit.</p>
              </div>
            )}

            <fieldset disabled={!editable || busy} className="space-y-5 disabled:opacity-70">
              {/* Hours */}
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                <label htmlFor="hours" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
                  Hours logged
                  <span className="ml-2 text-xs font-normal text-[var(--h-64748b)]">Total hours worked this week</span>
                </label>
                <input
                  id="hours" type="number" min={0} max={168} step="0.5"
                  value={hours} onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g. 40" className={`${inputCls} max-w-[160px]`}
                />
              </div>

              {/* Activities — day-by-day */}
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-[var(--h-0b1c30)]">Daily activities</h3>
                  <p className="text-xs text-[var(--h-64748b)]">Pick a day, then log what you worked on</p>
                </div>

                {/* Day rail — Mon–Fri */}
                <div className="mb-4 grid grid-cols-5 gap-1.5">
                  {days.map((d) => {
                    const n = countByDay.get(d.ymd) ?? 0;
                    const active = d.ymd === selectedDay;
                    return (
                      <button
                        key={d.ymd}
                        type="button"
                        onClick={() => setSelectedDay(d.ymd)}
                        className={`relative flex flex-col items-center gap-0.5 rounded-lg border py-2 transition-colors ${
                          active
                            ? 'border-[var(--h-8a4cfc)] bg-[var(--h-f1ecff)]'
                            : 'border-[var(--h-eef0f5)] bg-[var(--h-ffffff)] hover:border-[var(--h-d8dce6)]'
                        }`}
                      >
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-[var(--h-712ae2)]' : 'text-[var(--h-64748b)]'}`}>
                          {WEEKDAY_SHORT[d.dow]}
                        </span>
                        <span className={`text-sm font-bold ${active ? 'text-[var(--h-15157d)]' : 'text-[var(--h-0b1c30)]'}`}>
                          {d.dom}
                        </span>
                        {n > 0 ? (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--h-1b7a45)] px-1 text-[9px] font-bold text-white">
                            {n}
                          </span>
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--h-e2e6ef)]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected-day header + add */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--h-0b1c30)]">
                    {selectedDay ? `${WEEKDAY_LONG[selectedDow]} · ${fmtDate(selectedDay)}` : 'Select a day'}
                  </p>
                  <button
                    type="button" onClick={addActivity}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--h-f1ecff)] px-3 py-1.5 text-sm font-medium text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-e6dcff)] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Add activity
                  </button>
                </div>

                <div className="space-y-4">
                  {dayActivities.length === 0 && (
                    <button
                      type="button" onClick={addActivity}
                      className="w-full rounded-lg border border-dashed border-[var(--h-d8dce6)] py-7 text-center text-sm text-[var(--h-94a3b8)] transition-colors hover:border-[var(--h-8a4cfc)] hover:text-[var(--h-712ae2)]"
                    >
                      Nothing logged for {selectedDay ? WEEKDAY_LONG[selectedDow] : 'this day'} yet — tap to add an activity.
                    </button>
                  )}
                  {dayActivities.map(({ a, i }) => {
                    const detected = detectCompetencies(a.description, a.competencyTags);
                    return (
                      <div key={i} className="rounded-lg border border-[var(--h-e8ebf2)] bg-[var(--h-fbfcfe)] p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <input
                            type="date" value={a.activityDate}
                            min={scheduleWeek.periodStart} max={scheduleWeek.periodEnd}
                            onChange={(e) => {
                              updateActivity(i, { activityDate: e.target.value });
                              setSelectedDay(e.target.value);
                            }}
                            className={`${inputCls} max-w-[180px]`}
                          />
                          <button
                            type="button" onClick={() => removeActivity(i)}
                            className="rounded-md p-1.5 text-[var(--h-94a3b8)] transition-colors hover:bg-[var(--h-ffe2dc)] hover:text-[var(--h-b3261e)]"
                            aria-label="Remove activity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <textarea
                          rows={2} value={a.description}
                          onChange={(e) => updateActivity(i, { description: e.target.value })}
                          placeholder="Describe what you did…"
                          className={`${inputCls} resize-none`}
                        />
                        {/* Competency tags */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {a.competencyTags.map((t) => (
                            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--h-e1e8ff)] px-2 py-0.5 text-xs font-medium text-[var(--h-15157d)]">
                              {t}
                              <button type="button" onClick={() => removeTag(i, t)} aria-label={`Remove ${t}`}>
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text" value={tagDrafts[i] ?? ''}
                            onChange={(e) => setTagDrafts((d) => ({ ...d, [i]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); addTag(i, tagDrafts[i] ?? ''); }
                            }}
                            placeholder="+ competency"
                            className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-d8dce6)] focus:outline-none"
                          />
                        </div>
                        {/* Smart, typed-from-text detection (advisory; tap to confirm) */}
                        {detected.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md bg-[var(--h-f1ecff)] px-2 py-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--h-712ae2)]">
                              <Sparkles className="h-3 w-3" /> Detected
                            </span>
                            {detected.map((s) => (
                              <button
                                key={s} type="button" onClick={() => addTag(i, s)}
                                className="rounded-full border border-[var(--h-d3c4ff)] bg-[var(--h-ffffff)] px-2 py-0.5 text-[11px] font-medium text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-e6dcff)]"
                              >
                                + {s}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {COMPETENCY_SUGGESTIONS.filter((s) => !a.competencyTags.includes(s) && !detected.includes(s)).slice(0, 5).map((s) => (
                            <button
                              key={s} type="button" onClick={() => addTag(i, s)}
                              className="rounded px-1.5 py-0.5 text-[11px] text-[var(--h-64748b)] transition-colors hover:text-[var(--h-712ae2)]"
                            >
                              + {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reflection */}
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--h-0b1c30)]">Reflection</h3>
                <div>
                  <label htmlFor="learning" className="mb-1.5 block text-sm font-medium text-[var(--h-0b1c30)]">
                    What did you learn?
                  </label>
                  <textarea
                    id="learning" rows={3} value={learning}
                    onChange={(e) => setLearning(e.target.value)}
                    placeholder="Key takeaways and skills gained this week…"
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <div>
                  <label htmlFor="challenges" className="mb-1.5 block text-sm font-medium text-[var(--h-0b1c30)]">
                    Challenges faced
                  </label>
                  <textarea
                    id="challenges" rows={3} value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    placeholder="Problems you ran into and how you handled them…"
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--h-464652)]">
                  <input
                    type="checkbox" checked={supervisorVisible}
                    onChange={(e) => setSupervisorVisible(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--h-d8dce6)] text-[var(--h-8a4cfc)] focus:ring-[var(--h-8a4cfc)]"
                  />
                  Share this reflection with my company supervisor
                </label>
              </div>

              {/* Learning objectives — map this week's work (confirm AI suggestions) */}
              {existing?.id && (
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <EntryObjectives entryId={existing.id} placementId={activePlacement?.id} editable={editable} />
                </div>
              )}

              {/* Evidence — photos / documents. Available once the week is saved. */}
              {existing?.id && (
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <EntryAttachments entryId={existing.id} editable={editable} />
                </div>
              )}
            </fieldset>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--h-f5b8ad)] bg-[var(--h-fff1ee)] px-4 py-3 text-sm text-[var(--h-b3261e)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {/* Actions */}
            {editable && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button" onClick={handleSave} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-4 py-2.5 text-sm font-medium text-[var(--h-464652)] transition-colors hover:border-[var(--h-b9c0d0)] hover:text-[var(--h-0b1c30)] disabled:opacity-60"
                >
                  {saved ? (
                    <><CheckCircle2 className="h-4 w-4 text-[var(--h-1b7a45)]" /> Saved</>
                  ) : saveDraft.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    'Save draft'
                  )}
                </button>
                <button
                  type="button" onClick={handleSubmit} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitEntry.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                  ) : (
                    <><Send className="h-4 w-4" /> {status === 'returned' ? 'Resubmit week' : 'Submit week'}</>
                  )}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

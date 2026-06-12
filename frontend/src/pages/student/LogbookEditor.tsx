import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, X, Trash2, CheckCircle2, Clock, RotateCcw, Lock,
  Send, Calendar, AlertCircle, BookOpen, XCircle,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useEntries, useEntry, useSaveEntryDraft, useSubmitEntry,
  type EntryStatus, type EntryActivity,
} from '@/hooks/useEntries';
import { EntryObjectives } from '@/components/objectives/EntryObjectives';

const COMPETENCY_SUGGESTIONS = [
  'Problem Solving', 'Teamwork', 'Communication', 'Technical Writing',
  'Debugging', 'Version Control', 'Testing', 'Code Review', 'Time Management',
];

// ── Date helpers (UTC-safe; the API uses date-only YYYY-MM-DD) ──
function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ymd(iso: string): string {
  return iso.slice(0, 10);
}
function addDaysYMD(start: Date, days: number): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

interface ScheduleWeek {
  weekNumber:  number; // absolute index from the placement start — stable storage key
  label:       number; // 1..12 position within the visible window — display only
  periodStart: string;
  periodEnd:   string;
}

const SCHEDULE_WEEKS = 12;

// Derive a rolling window of the most recent 12 weeks, ending on the week that
// contains today, so the schedule always tracks real time (dates stay current).
// Week boundaries keep the placement's weekday cadence, and `weekNumber` stays
// anchored to the placement start so saved entries never collide as the window
// rolls forward; `label` is the friendly 1..12 number shown in the UI.
function buildSchedule(startDate: string | null): ScheduleWeek[] {
  if (!startDate) return [];
  const start = new Date(`${ymd(startDate)}T00:00:00Z`);
  const today = new Date(`${toYMD(new Date())}T00:00:00Z`);
  if (today.getTime() < start.getTime()) return []; // placement hasn't started yet

  const weekMs = 7 * 86_400_000;
  const currentOffset = Math.floor((today.getTime() - start.getTime()) / weekMs);
  const firstOffset = Math.max(0, currentOffset - (SCHEDULE_WEEKS - 1));

  const weeks: ScheduleWeek[] = [];
  for (let off = firstOffset; off <= currentOffset; off++) {
    const periodStart = addDaysYMD(start, off * 7);
    weeks.push({
      weekNumber:  off + 1,
      label:       off - firstOffset + 1,
      periodStart: toYMD(periodStart),
      periodEnd:   toYMD(addDaysYMD(periodStart, 6)),
    });
  }
  return weeks;
}

// Default a new activity to today when today falls inside the week; otherwise
// clamp to the week's bounds. (YMD strings compare correctly lexicographically.)
function defaultActivityDate(week: ScheduleWeek): string {
  const today = toYMD(new Date());
  if (today < week.periodStart) return week.periodStart;
  if (today > week.periodEnd) return week.periodEnd;
  return today;
}

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const s = new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
  const e = new Date(`${end}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, year: 'numeric', timeZone: 'UTC' });
  return `${s} – ${e}`;
}

const STATUS_META: Record<EntryStatus | 'not_started', { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-[#eef0f5] text-[#64748b] border-[#d8dce6]', Icon: Calendar },
  draft:        { label: 'Draft',        cls: 'bg-[#fff4e0] text-[#9a6700] border-[#f3d690]', Icon: Clock },
  submitted:    { label: 'Submitted',    cls: 'bg-[#e1e8ff] text-[#15157d] border-[#bcc8ff]', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-[#ffe2dc] text-[#b3261e] border-[#f5b8ad]', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[#dcf5e6] text-[#1b7a45] border-[#aee3c2]', Icon: CheckCircle2 },
  rejected:     { label: 'Rejected',     cls: 'bg-[#fde7e7] text-[#8a1c1c] border-[#f1b4b4]', Icon: XCircle },
};

function StatusPill({ status }: { status: EntryStatus | 'not_started' }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

const emptyActivity = (date: string): EntryActivity => ({
  activityDate: date, description: '', competencyTags: [],
});

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

  const saveDraft = useSaveEntryDraft();
  const submitEntry = useSubmitEntry();

  // Repopulate the form whenever the selected week (or its loaded detail) changes.
  useEffect(() => {
    if (!scheduleWeek) return;
    setError(null);
    setSaved(false);
    setTagDrafts({});
    if (detail && detail.weekNumber === selectedWeek) {
      setHours(detail.hoursLogged != null ? String(detail.hoursLogged) : '');
      setActivities(
        (detail.activities ?? []).map((a) => ({
          activityDate: ymd(a.activityDate),
          description: a.description,
          competencyTags: a.competencyTags ?? [],
        })),
      );
      setLearning(detail.reflection?.learning ?? '');
      setChallenges(detail.reflection?.challenges ?? '');
      setSupervisorVisible(detail.reflection?.supervisorVisible ?? true);
    } else if (!existing) {
      // Fresh week — start blank with one activity row on the period start.
      setHours('');
      setActivities([emptyActivity(defaultActivityDate(scheduleWeek))]);
      setLearning('');
      setChallenges('');
      setSupervisorVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, detail?.id, detail?.version]);

  const status: EntryStatus | 'not_started' = existing?.status ?? 'not_started';
  const editable = status === 'not_started' || status === 'draft' || status === 'returned';

  const returnComment = useMemo(() => {
    if (status !== 'returned' || !detail?.events) return null;
    const ev = [...detail.events].reverse().find((e) => e.toStatus === 'returned');
    return ev?.comment ?? null;
  }, [status, detail?.events]);

  const rejectComment = useMemo(() => {
    if (status !== 'rejected' || !detail?.events) return null;
    const ev = [...detail.events].reverse().find((e) => e.toStatus === 'rejected');
    return ev?.comment ?? null;
  }, [status, detail?.events]);

  // ── Activity row mutations ──
  const updateActivity = (i: number, patch: Partial<EntryActivity>) =>
    setActivities((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addActivity = () =>
    setActivities((prev) => [...prev, emptyActivity(scheduleWeek ? defaultActivityDate(scheduleWeek) : toYMD(new Date()))]);
  const removeActivity = (i: number) =>
    setActivities((prev) => prev.filter((_, j) => j !== i));
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

  function buildPayload() {
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
  }

  const apiErr = (e: unknown) =>
    ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
    'Something went wrong. Please try again.';

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setError(null);
    try {
      await saveDraft.mutateAsync(payload);
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

  // ── Loading / empty states ──
  if (placementsLoading || entriesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
      </div>
    );
  }

  if (!activePlacement) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-[#8a4cfc]" />
        <h2 className="mb-1 text-lg font-bold text-[#0b1c30]">No active placement</h2>
        <p className="text-sm text-[#464652]">
          Your logbook opens once your placement is approved. Check back after coordinator approval.
        </p>
      </div>
    );
  }

  if (schedule.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <Calendar className="mx-auto mb-4 h-12 w-12 text-[#8a4cfc]" />
        <h2 className="mb-1 text-lg font-bold text-[#0b1c30]">Your placement hasn't started yet</h2>
        <p className="text-sm text-[#464652]">
          The first logbook week opens on the placement start date.
        </p>
      </div>
    );
  }

  const busy = saveDraft.isPending || submitEntry.isPending;
  const inputCls =
    'w-full rounded-lg border border-[#d8dce6] bg-white px-3 py-2 text-sm text-[#0b1c30] placeholder-[#94a3b8] transition-colors focus:border-[#8a4cfc] focus:outline-none focus:ring-1 focus:ring-[#8a4cfc]';

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0b1c30]">Logbook</h1>
        <p className="mt-0.5 text-sm text-[#464652]">
          {activePlacement.company?.name ?? 'Your placement'} · weekly entries
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Week rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[#e2e6ef] bg-white">
            <div className="border-b border-[#e2e6ef] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
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
                    className={`flex w-full items-center justify-between gap-2 border-b border-[#f0f2f7] px-4 py-3 text-left transition-colors last:border-0 ${
                      active ? 'bg-[#f1ecff]' : 'hover:bg-[#f8f9ff]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${active ? 'text-[#15157d]' : 'text-[#0b1c30]'}`}>
                        Week {w.label}
                      </p>
                      <p className="truncate text-[11px] text-[#64748b]">{fmtRange(w.periodStart, w.periodEnd)}</p>
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
                <h2 className="text-lg font-bold text-[#0b1c30]">Week {scheduleWeek.label}</h2>
                <p className="text-sm text-[#464652]">{fmtRange(scheduleWeek.periodStart, scheduleWeek.periodEnd)}</p>
              </div>
              <StatusPill status={status} />
            </div>

            {/* Status banners */}
            {status === 'submitted' && (
              <div className="flex items-start gap-2 rounded-lg border border-[#bcc8ff] bg-[#eef1ff] px-4 py-3 text-sm text-[#15157d]">
                <Send className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This week is submitted and awaiting your supervisor's review. It's read-only until they respond.</span>
              </div>
            )}
            {status === 'acknowledged' && (
              <div className="flex items-start gap-2 rounded-lg border border-[#aee3c2] bg-[#e9f9ef] px-4 py-3 text-sm text-[#1b7a45]">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Your supervisor acknowledged this week. It's finalized and locked.</span>
              </div>
            )}
            {status === 'returned' && (
              <div className="rounded-lg border border-[#f5b8ad] bg-[#fff1ee] px-4 py-3 text-sm text-[#b3261e]">
                <div className="flex items-center gap-2 font-semibold">
                  <RotateCcw className="h-4 w-4" /> Returned for revision
                </div>
                {returnComment && <p className="mt-1 pl-6 text-[#7a2018]">"{returnComment}"</p>}
                <p className="mt-1 pl-6 text-[#7a2018]/80">Edit your entry below and resubmit.</p>
              </div>
            )}
            {status === 'rejected' && (
              <div className="rounded-lg border border-[#f1b4b4] bg-[#fde7e7] px-4 py-3 text-sm text-[#8a1c1c]">
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle className="h-4 w-4" /> This week was rejected
                </div>
                {rejectComment && <p className="mt-1 pl-6 text-[#6f1717]">"{rejectComment}"</p>}
                <p className="mt-1 pl-6 text-[#6f1717]/80">This week is closed and can no longer be edited.</p>
              </div>
            )}

            <fieldset disabled={!editable || busy} className="space-y-5 disabled:opacity-70">
              {/* Hours */}
              <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                <label htmlFor="hours" className="mb-1.5 block text-sm font-semibold text-[#0b1c30]">
                  Hours logged
                  <span className="ml-2 text-xs font-normal text-[#64748b]">Total hours worked this week</span>
                </label>
                <input
                  id="hours" type="number" min={0} max={168} step="0.5"
                  value={hours} onChange={(e) => setHours(e.target.value)}
                  placeholder="e.g. 40" className={`${inputCls} max-w-[160px]`}
                />
              </div>

              {/* Activities */}
              <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0b1c30]">Activities</h3>
                    <p className="text-xs text-[#64748b]">What you worked on, day by day</p>
                  </div>
                  <button
                    type="button" onClick={addActivity}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#f1ecff] px-3 py-1.5 text-sm font-medium text-[#712ae2] transition-colors hover:bg-[#e6dcff] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Add activity
                  </button>
                </div>

                <div className="space-y-4">
                  {activities.length === 0 && (
                    <p className="rounded-lg border border-dashed border-[#d8dce6] py-6 text-center text-sm text-[#94a3b8]">
                      No activities yet — add one to describe your week.
                    </p>
                  )}
                  {activities.map((a, i) => (
                    <div key={i} className="rounded-lg border border-[#e8ebf2] bg-[#fbfcfe] p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <input
                          type="date" value={a.activityDate}
                          min={scheduleWeek.periodStart} max={scheduleWeek.periodEnd}
                          onChange={(e) => updateActivity(i, { activityDate: e.target.value })}
                          className={`${inputCls} max-w-[180px]`}
                        />
                        <button
                          type="button" onClick={() => removeActivity(i)}
                          className="rounded-md p-1.5 text-[#94a3b8] transition-colors hover:bg-[#ffe2dc] hover:text-[#b3261e]"
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
                          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#e1e8ff] px-2 py-0.5 text-xs font-medium text-[#15157d]">
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
                          className="min-w-[120px] flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-[#0b1c30] placeholder-[#94a3b8] focus:border-[#d8dce6] focus:outline-none"
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {COMPETENCY_SUGGESTIONS.filter((s) => !a.competencyTags.includes(s)).slice(0, 5).map((s) => (
                          <button
                            key={s} type="button" onClick={() => addTag(i, s)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-[#64748b] transition-colors hover:text-[#712ae2]"
                          >
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reflection */}
              <div className="rounded-xl border border-[#e2e6ef] bg-white p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#0b1c30]">Reflection</h3>
                <div>
                  <label htmlFor="learning" className="mb-1.5 block text-sm font-medium text-[#0b1c30]">
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
                  <label htmlFor="challenges" className="mb-1.5 block text-sm font-medium text-[#0b1c30]">
                    Challenges faced
                  </label>
                  <textarea
                    id="challenges" rows={3} value={challenges}
                    onChange={(e) => setChallenges(e.target.value)}
                    placeholder="Problems you ran into and how you handled them…"
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#464652]">
                  <input
                    type="checkbox" checked={supervisorVisible}
                    onChange={(e) => setSupervisorVisible(e.target.checked)}
                    className="h-4 w-4 rounded border-[#d8dce6] text-[#8a4cfc] focus:ring-[#8a4cfc]"
                  />
                  Share this reflection with my company supervisor
                </label>
              </div>

              {/* Learning objectives — map this week's work (confirm AI suggestions) */}
              {existing?.id && (
                <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                  <EntryObjectives entryId={existing.id} placementId={activePlacement?.id} editable={editable} />
                </div>
              )}
            </fieldset>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[#f5b8ad] bg-[#fff1ee] px-4 py-3 text-sm text-[#b3261e]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {/* Actions */}
            {editable && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button" onClick={handleSave} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#d8dce6] bg-white px-4 py-2.5 text-sm font-medium text-[#464652] transition-colors hover:border-[#b9c0d0] hover:text-[#0b1c30] disabled:opacity-60"
                >
                  {saved ? (
                    <><CheckCircle2 className="h-4 w-4 text-[#1b7a45]" /> Saved</>
                  ) : saveDraft.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    'Save draft'
                  )}
                </button>
                <button
                  type="button" onClick={handleSubmit} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#15157d] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1f1fa0] disabled:cursor-not-allowed disabled:opacity-60"
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

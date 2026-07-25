import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CalendarDays, CheckCircle2, Clock, AlertCircle, Lock,
  BookOpen, Sun, Stethoscope, CircleSlash, Save,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useSiwesCalendar, useSaveDailyEntry, useSaveWeeklySummary, useRecordAbsence,
  type SiwesCalendarDay,
} from '@/hooks/useSiwes';
import { ghanaYMD, fmtDate } from '@/lib/schedule';

// Student SIWES daily logbook: one entry per working day (description of work
// done + new skills learnt, mirroring the paper instrument), a weekly report
// per week, and sick/permitted absence self-reporting. Day admissibility and
// lateness are decided by the backend — this page only mirrors them visually.

function errMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message ?? 'Something went wrong. Please try again.';
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayShort(ymd: string): string {
  return WEEKDAY_SHORT[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
}

function dayOfMonth(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDate();
}

type DayVisual = {
  label: string;
  cls: string;
  Icon: React.ElementType;
};

function dayVisual(day: SiwesCalendarDay, today: string): DayVisual {
  if (day.entry) {
    return day.entry.loggedLate
      ? { label: `Logged ${day.entry.lateByDays} day${day.entry.lateByDays === 1 ? '' : 's'} late`, cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]', Icon: Clock }
      : { label: 'Logged', cls: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]', Icon: CheckCircle2 };
  }
  if (day.absence) {
    const kind = day.absence.kind === 'sick' ? 'Sick' : day.absence.kind === 'permitted' ? 'Permitted absence' : 'Unexcused absence';
    return { label: kind, cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]', Icon: Stethoscope };
  }
  if (day.class === 'non_working') {
    return { label: 'Public holiday', cls: 'bg-[var(--h-eef0f5)] text-[var(--h-94a3b8)]', Icon: Sun };
  }
  if (day.date > today) {
    return { label: 'Upcoming', cls: 'bg-[var(--h-eef0f5)] text-[var(--h-94a3b8)]', Icon: Clock };
  }
  if (day.missing) {
    return { label: 'Not logged', cls: 'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)]', Icon: AlertCircle };
  }
  return { label: 'Open', cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]', Icon: CalendarDays };
}

export default function DailyLogbook() {
  const today = ghanaYMD();
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const placement =
    placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];

  const { data: calendar, isLoading: calendarLoading } = useSiwesCalendar(placement?.id);

  const saveEntry = useSaveDailyEntry(placement?.id);
  const saveSummary = useSaveWeeklySummary(placement?.id);
  const recordAbsence = useRecordAbsence(placement?.id);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Form state for the selected day / week.
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState('');
  const [reportText, setReportText] = useState('');
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [absenceKind, setAbsenceKind] = useState<'sick' | 'permitted'>('sick');
  const [absenceReason, setAbsenceReason] = useState('');

  const weeks = useMemo(() => {
    if (!calendar) return [];
    const byWeek = new Map<number, SiwesCalendarDay[]>();
    for (const day of calendar.days) {
      if (day.class === 'weekly_rest') continue; // rest days carry no state worth a row
      const list = byWeek.get(day.weekNumber) ?? [];
      list.push(day);
      byWeek.set(day.weekNumber, list);
    }
    return [...byWeek.entries()]
      .map(([weekNumber, days]) => ({ weekNumber, days }))
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }, [calendar]);

  // Default to the current week (the last week containing a non-future day).
  useEffect(() => {
    if (selectedWeek !== null || weeks.length === 0) return;
    const current = [...weeks].reverse().find((w) => w.days.some((d) => d.date <= today));
    setSelectedWeek((current ?? weeks[0]).weekNumber);
  }, [weeks, selectedWeek, today]);

  const week = weeks.find((w) => w.weekNumber === selectedWeek);
  const day = week?.days.find((d) => d.date === selectedDate) ?? null;
  const summary = calendar?.weeklySummaries.find((s) => s.weekNumber === selectedWeek);

  // Sync form state when the selection changes.
  useEffect(() => {
    setDescription(day?.entry?.descriptionOfWork ?? '');
    setSkills(day?.entry?.newSkillsLearnt ?? '');
    setAbsenceOpen(false);
    setAbsenceReason('');
    saveEntry.reset();
    recordAbsence.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    setReportText(summary?.reportText ?? '');
    saveSummary.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, summary?.id]);

  if (placementsLoading || calendarLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
      </div>
    );
  }

  if (!placement || !calendar) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--h-8a4cfc)]" />
        <h2 className="mb-1 text-lg font-bold text-[var(--h-0b1c30)]">No active placement</h2>
        <p className="text-sm text-[var(--h-464652)]">
          Your daily logbook opens once your placement is approved and started.
        </p>
      </div>
    );
  }

  const loggedCount = calendar.days.filter((d) => d.entry).length;
  const missingCount = calendar.days.filter((d) => d.missing).length;

  const entryLocked =
    !!day?.entry && new Date(day.entry.editableUntil).getTime() < Date.now();
  const dayWritable =
    !!day && !day.absence && day.class === 'working' && day.date <= today && !entryLocked;
  const canReportAbsence =
    !!day && !day.entry && !day.absence && day.class === 'working' && day.date <= today;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Daily logbook</h1>
        <p className="mt-1 text-sm text-[var(--h-464652)]">
          {fmtDate(calendar.chainStart)} – {fmtDate(calendar.chainEnd)} · {calendar.totalWeeks} weeks
          · {loggedCount} day{loggedCount === 1 ? '' : 's'} logged
          {missingCount > 0 && (
            <span className="text-[var(--h-b3261e)]"> · {missingCount} not logged</span>
          )}
        </p>
      </div>

      {/* ── Week selector ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {weeks.map((w) => {
          const started = w.days.some((d) => d.date <= today);
          const attention = w.days.some((d) => d.missing);
          return (
            <button
              key={w.weekNumber}
              onClick={() => { setSelectedWeek(w.weekNumber); setSelectedDate(null); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                w.weekNumber === selectedWeek
                  ? 'bg-[var(--h-15157d)] text-[var(--h-ffffff)]'
                  : started
                    ? 'bg-[var(--h-eef0f5)] text-[var(--h-0b1c30)] hover:bg-[var(--h-dce9ff)]'
                    : 'bg-[var(--h-eef0f5)] text-[var(--h-94a3b8)]'
              }`}
            >
              Week {w.weekNumber}
              {attention && w.weekNumber !== selectedWeek && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--h-b3261e)] align-middle" />
              )}
            </button>
          );
        })}
      </div>

      {week && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* ── Day list ── */}
          <div className="space-y-2">
            {week.days.map((d) => {
              const v = dayVisual(d, today);
              const selectable = d.class === 'working';
              return (
                <button
                  key={d.date}
                  disabled={!selectable}
                  onClick={() => setSelectedDate(d.date)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    d.date === selectedDate
                      ? 'border-[var(--h-8a4cfc)] bg-[var(--h-f6f1ff)]'
                      : 'border-[var(--h-c4c5d5-40)] bg-[var(--h-ffffff)]'
                  } ${selectable ? 'hover:border-[var(--h-8a4cfc)]' : 'cursor-default opacity-70'}`}
                >
                  <span className="w-10 shrink-0 text-center">
                    <span className="block text-[11px] font-semibold text-[var(--h-757684)]">
                      {weekdayShort(d.date)}
                    </span>
                    <span className="block text-base font-bold text-[var(--h-0b1c30)]">
                      {dayOfMonth(d.date)}
                    </span>
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.cls}`}>
                    <v.Icon className="h-3 w-3" /> {v.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel ── */}
          <div className="space-y-4">
            {!day && (
              <div className="rounded-xl border border-[var(--h-c4c5d5-40)] bg-[var(--h-ffffff)] px-6 py-10 text-center">
                <CalendarDays className="mx-auto mb-3 h-8 w-8 text-[var(--h-8a4cfc)]" />
                <p className="text-sm text-[var(--h-464652)]">
                  Select a day to log what you worked on.
                </p>
              </div>
            )}

            {day && (
              <div className="rounded-xl border border-[var(--h-c4c5d5-40)] bg-[var(--h-ffffff)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">{fmtDate(day.date)}</h2>
                  {entryLocked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-eef0f5)] px-2 py-0.5 text-[11px] font-semibold text-[var(--h-64748b)]">
                      <Lock className="h-3 w-3" /> Editing closed
                    </span>
                  )}
                </div>

                {day.absence ? (
                  <p className="text-sm text-[var(--h-464652)]">
                    Recorded as {day.absence.kind === 'sick' ? 'sick leave' : `a ${day.absence.kind} absence`}
                    {day.absence.reason && <> — {day.absence.reason}</>}.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--h-464652)]" htmlFor="siwes-work">
                        Description of work done
                      </label>
                      <textarea
                        id="siwes-work"
                        rows={4}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={!dayWritable}
                        placeholder="What did you work on today?"
                        className="w-full rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder:text-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none disabled:bg-[var(--h-eef0f5)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--h-464652)]" htmlFor="siwes-skills">
                        New skills learnt
                      </label>
                      <textarea
                        id="siwes-skills"
                        rows={2}
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        disabled={!dayWritable}
                        placeholder="Skills, tools or procedures you picked up"
                        className="w-full rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder:text-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none disabled:bg-[var(--h-eef0f5)]"
                      />
                    </div>

                    {saveEntry.isError && (
                      <p className="text-xs text-[var(--h-b3261e)]">{errMessage(saveEntry.error)}</p>
                    )}

                    {dayWritable && (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() =>
                            saveEntry.mutate({
                              placementId: placement.id,
                              workDate: day.date,
                              descriptionOfWork: description.trim(),
                              newSkillsLearnt: skills.trim(),
                            })
                          }
                          disabled={!description.trim() || !skills.trim() || saveEntry.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-[var(--h-ffffff)] transition-opacity disabled:opacity-50"
                        >
                          {saveEntry.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Save className="h-4 w-4" />}
                          {day.entry ? 'Update entry' : 'Save entry'}
                        </button>
                        {day.entry && !entryLocked && (
                          <span className="text-[11px] text-[var(--h-757684)]">
                            Editable until {fmtDate(day.entry.editableUntil.slice(0, 10))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Absence self-report ── */}
                {canReportAbsence && !absenceOpen && (
                  <button
                    onClick={() => setAbsenceOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--h-757684)] hover:text-[var(--h-b3261e)]"
                  >
                    <CircleSlash className="h-3.5 w-3.5" /> I was absent this day
                  </button>
                )}
                {canReportAbsence && absenceOpen && (
                  <div className="mt-4 space-y-3 rounded-lg border border-[var(--h-c4c5d5-40)] bg-[var(--h-f8f9fc)] p-3">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--h-0b1c30)]">
                        <input
                          type="radio"
                          checked={absenceKind === 'sick'}
                          onChange={() => setAbsenceKind('sick')}
                        />
                        Sick
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm text-[var(--h-0b1c30)]">
                        <input
                          type="radio"
                          checked={absenceKind === 'permitted'}
                          onChange={() => setAbsenceKind('permitted')}
                        />
                        Permitted (with approval)
                      </label>
                    </div>
                    <input
                      value={absenceReason}
                      onChange={(e) => setAbsenceReason(e.target.value)}
                      placeholder={absenceKind === 'permitted' ? 'Reason (required)' : 'Reason (optional)'}
                      className="w-full rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder:text-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none"
                    />
                    {recordAbsence.isError && (
                      <p className="text-xs text-[var(--h-b3261e)]">{errMessage(recordAbsence.error)}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          recordAbsence.mutate({
                            placementId: placement.id,
                            absenceDate: day.date,
                            kind: absenceKind,
                            reason: absenceReason.trim() || undefined,
                          })
                        }
                        disabled={
                          recordAbsence.isPending ||
                          (absenceKind === 'permitted' && !absenceReason.trim())
                        }
                        className="rounded-lg bg-[var(--h-b3261e)] px-3 py-1.5 text-xs font-semibold text-[var(--h-ffffff)] transition-opacity disabled:opacity-50"
                      >
                        {recordAbsence.isPending ? 'Recording…' : 'Record absence'}
                      </button>
                      <button
                        onClick={() => setAbsenceOpen(false)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--h-757684)] hover:bg-[var(--h-eef0f5)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Weekly report ── */}
            <div className="rounded-xl border border-[var(--h-c4c5d5-40)] bg-[var(--h-ffffff)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">
                  Weekly report — week {week.weekNumber}
                </h2>
                {summary && (
                  <span className="text-[11px] text-[var(--h-757684)]">
                    Week ending {fmtDate(summary.weekEnding.slice(0, 10))}
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="Summarise the week's work in your own words"
                className="w-full rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder:text-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none"
              />
              {saveSummary.isError && (
                <p className="mt-1 text-xs text-[var(--h-b3261e)]">{errMessage(saveSummary.error)}</p>
              )}
              <button
                onClick={() =>
                  saveSummary.mutate({
                    placementId: placement.id,
                    weekNumber: week.weekNumber,
                    reportText: reportText.trim(),
                  })
                }
                disabled={!reportText.trim() || saveSummary.isPending}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-[var(--h-ffffff)] transition-opacity disabled:opacity-50"
              >
                {saveSummary.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Save className="h-4 w-4" />}
                {summary ? 'Update report' : 'Save report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

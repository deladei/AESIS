import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CheckCircle2, Clock, AlertCircle, Sun, Stethoscope, CalendarDays,
} from 'lucide-react';
import { useSiwesCalendar, type SiwesCalendarDay } from '@/hooks/useSiwes';
import { ghanaYMD, fmtDate } from '@/lib/schedule';
import LatePill from '@/components/shared/LatePill';

// Read-only view of a student's SIWES daily logbook, for supervisors and
// coordinators. Shows the chain-aware calendar (day classification, late
// flags, absences, missing days) plus the weekly trainee reports. Reviewers
// never author content here — that is the student's page.

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayShort = (ymd: string) => WEEKDAY_SHORT[new Date(`${ymd}T00:00:00Z`).getUTCDay()];
const dayOfMonth = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDate();

function statusPill(day: SiwesCalendarDay, today: string) {
  // Lateness rides alongside as its own pill (one shared label app-wide), so
  // this only says whether the day was written up.
  if (day.entry) {
    return { label: 'Logged', cls: 'bg-ok-soft text-ok', Icon: CheckCircle2 };
  }
  if (day.absence) {
    const label =
      day.absence.kind === 'sick' ? 'Sick' :
      day.absence.kind === 'permitted' ? 'Permitted absence' : 'Unexcused absence';
    const cls =
      day.absence.kind === 'unexcused'
        ? 'bg-danger-soft text-danger'
        : 'bg-surface-sunken text-ink-secondary';
    return { label, cls, Icon: Stethoscope };
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

export function SiwesCalendarPanel({ placementId }: { placementId: string }) {
  const today = ghanaYMD();
  const { data: calendar, isLoading, isError } = useSiwesCalendar(placementId);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const weeks = useMemo(() => {
    if (!calendar) return [];
    const byWeek = new Map<number, SiwesCalendarDay[]>();
    for (const day of calendar.days) {
      if (day.class === 'weekly_rest') continue;
      const list = byWeek.get(day.weekNumber) ?? [];
      list.push(day);
      byWeek.set(day.weekNumber, list);
    }
    return [...byWeek.entries()]
      .map(([weekNumber, days]) => ({ weekNumber, days }))
      .sort((a, b) => a.weekNumber - b.weekNumber);
  }, [calendar]);

  useEffect(() => {
    if (selectedWeek !== null || weeks.length === 0) return;
    const current = [...weeks].reverse().find((w) => w.days.some((d) => d.date <= today));
    setSelectedWeek((current ?? weeks[0]).weekNumber);
  }, [weeks, selectedWeek, today]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-line bg-surface">
        <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
      </div>
    );
  }
  // A placement from before the daily logbook existed simply has no calendar —
  // render nothing rather than an error the reviewer can't act on.
  if (isError || !calendar) return null;

  const week = weeks.find((w) => w.weekNumber === selectedWeek);
  const summary = calendar.weeklySummaries.find((s) => s.weekNumber === selectedWeek);
  const loggedCount = calendar.days.filter((d) => d.entry).length;
  const missingCount = calendar.days.filter((d) => d.missing).length;
  const lateCount = calendar.days.filter((d) => d.entry?.loggedLate).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line bg-surface-sunken px-6 py-4">
        <h3 className="text-lg font-semibold text-brand-ink">Daily logbook</h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          {fmtDate(calendar.chainStart)} – {fmtDate(calendar.chainEnd)}
          · {loggedCount} day{loggedCount === 1 ? '' : 's'} logged
          {lateCount > 0 && <> · {lateCount} late</>}
          {missingCount > 0 && (
            <span className="font-semibold text-danger"> · {missingCount} not logged</span>
          )}
        </p>
      </div>

      <div className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {weeks.map((w) => {
            const attention = w.days.some((d) => d.missing || d.absence?.kind === 'unexcused');
            return (
              <button
                key={w.weekNumber}
                onClick={() => setSelectedWeek(w.weekNumber)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  w.weekNumber === selectedWeek
                    ? 'bg-brand text-ink-inverse'
                    : 'bg-surface-sunken text-ink hover:bg-brand-soft'
                }`}
              >
                Week {w.weekNumber}
                {attention && w.weekNumber !== selectedWeek && (
                  <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-danger align-middle" />
                )}
              </button>
            );
          })}
        </div>

        {week && (
          <div className="space-y-2">
            {week.days.map((d) => {
              const pill = statusPill(d, today);
              return (
                <div
                  key={d.date}
                  className="rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-center">
                      <span className="block text-[11px] font-semibold text-ink-muted">
                        {weekdayShort(d.date)}
                      </span>
                      <span className="block text-base font-bold text-ink">
                        {dayOfMonth(d.date)}
                      </span>
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.cls}`}>
                      <pill.Icon className="h-3 w-3" /> {pill.label}
                    </span>
                    <LatePill days={d.entry?.lateByDays ?? 0} />
                  </div>

                  {d.entry && (
                    <div className="mt-2 space-y-1.5 pl-13 text-sm" style={{ paddingLeft: '3.25rem' }}>
                      <p className="text-ink">{d.entry.descriptionOfWork}</p>
                      <p className="text-xs text-ink-secondary">
                        <span className="font-semibold">Skills:</span> {d.entry.newSkillsLearnt}
                      </p>
                    </div>
                  )}
                  {d.absence?.reason && (
                    <p className="mt-1 text-xs text-ink-muted" style={{ paddingLeft: '3.25rem' }}>
                      {d.absence.reason}
                    </p>
                  )}
                </div>
              );
            })}

            {summary && (
              <div className="rounded-xl border border-line bg-surface-sunken px-4 py-3">
                <p className="text-xs font-semibold text-ink-muted">
                  Weekly report · week ending {fmtDate(summary.weekEnding.slice(0, 10))}
                </p>
                <p className="mt-1 text-sm text-ink">{summary.reportText}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

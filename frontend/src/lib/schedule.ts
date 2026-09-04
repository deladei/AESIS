// Logbook week scheduling — shared by the editor and the dashboard table.
// The API uses date-only YYYY-MM-DD; all comparisons are UTC-anchored off the
// GHANA calendar "today" (Africa/Accra — the programme's authoritative clock),
// so a device set to any other timezone can neither unlock a day early nor
// read a started day as not-yet-arrived. This mirrors the backend, whose
// todayUtc() equals the Ghana date (Accra is UTC+0 year-round).

export interface ScheduleWeek {
  weekNumber:  number; // absolute index from the placement start — stable storage key
  label:       number; // 1..N position within the visible window — display only
  periodStart: string;
  periodEnd:   string;
  upcoming:    boolean; // week hasn't started yet — visible but its days are locked
}

/**
 * Fallback length only, for the moment before the calendar has loaded. The real
 * number is the cohort's configured `durationWeeks`, which the calendar
 * endpoint returns as `totalWeeks` — cohorts run 24 weeks, so hardcoding 6 made
 * the dashboard table and the history page disagree with the logbook itself.
 */
export const SCHEDULE_WEEKS = 6;

export function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "Today" as the GHANA calendar date, regardless of the device timezone.
// en-CA formats as YYYY-MM-DD.
export function ghanaYMD(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(d);
}

export function ymd(iso: string): string {
  return iso.slice(0, 10);
}

export function addDaysYMD(start: Date, days: number): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// The programme is `totalWeeks` long, anchored at the placement start (week 1).
// Every week is visible so the student sees the whole programme; weeks whose
// start date hasn't arrived yet are marked `upcoming` (their days stay locked
// until the date arrives). Pass the cohort's real length — the default is only
// for the render before the calendar has answered.
export function buildSchedule(
  startDate: string | null,
  totalWeeks: number = SCHEDULE_WEEKS,
): ScheduleWeek[] {
  if (!startDate) return [];
  const span = Number.isFinite(totalWeeks) && totalWeeks > 0 ? totalWeeks : SCHEDULE_WEEKS;
  const start = new Date(`${ymd(startDate)}T00:00:00Z`);
  const today = new Date(`${ghanaYMD()}T00:00:00Z`);
  if (today.getTime() < start.getTime()) return []; // placement hasn't started yet

  const weeks: ScheduleWeek[] = [];
  for (let off = 0; off < span; off++) {
    const periodStart = addDaysYMD(start, off * 7);
    weeks.push({
      weekNumber:  off + 1,
      label:       off + 1,
      periodStart: toYMD(periodStart),
      periodEnd:   toYMD(addDaysYMD(periodStart, 6)),
      upcoming:    periodStart.getTime() > today.getTime(),
    });
  }
  return weeks;
}

export function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const s = new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
  const e = new Date(`${end}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, year: 'numeric', timeZone: 'UTC' });
  return `${s} – ${e}`;
}

export function fmtDate(d: string): string {
  return new Date(`${ymd(d)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

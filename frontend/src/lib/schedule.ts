// Logbook week scheduling — shared by the editor and the dashboard table.
// The API uses date-only YYYY-MM-DD; all comparisons are UTC-anchored off a
// LOCAL calendar "today" so a device off UTC doesn't read a started week as
// not-yet-started.

export interface ScheduleWeek {
  weekNumber:  number; // absolute index from the placement start — stable storage key
  label:       number; // 1..N position within the visible window — display only
  periodStart: string;
  periodEnd:   string;
}

export const SCHEDULE_WEEKS = 6;

export function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// "Today" as the user's LOCAL calendar date (not a UTC-derived one).
export function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ymd(iso: string): string {
  return iso.slice(0, 10);
}

export function addDaysYMD(start: Date, days: number): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// The internship is a fixed 6-week programme anchored at the placement start
// (week 1), revealing one week at a time as real time passes — a brand-new
// placement shows only Week 1, never exceeding week 6.
export function buildSchedule(startDate: string | null): ScheduleWeek[] {
  if (!startDate) return [];
  const start = new Date(`${ymd(startDate)}T00:00:00Z`);
  const today = new Date(`${localYMD(new Date())}T00:00:00Z`);
  if (today.getTime() < start.getTime()) return []; // placement hasn't started yet

  const weekMs = 7 * 86_400_000;
  const currentOffset = Math.floor((today.getTime() - start.getTime()) / weekMs);
  const lastOffset = Math.min(currentOffset, SCHEDULE_WEEKS - 1); // never past week 6

  const weeks: ScheduleWeek[] = [];
  for (let off = 0; off <= lastOffset; off++) {
    const periodStart = addDaysYMD(start, off * 7);
    weeks.push({
      weekNumber:  off + 1,
      label:       off + 1,
      periodStart: toYMD(periodStart),
      periodEnd:   toYMD(addDaysYMD(periodStart, 6)),
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

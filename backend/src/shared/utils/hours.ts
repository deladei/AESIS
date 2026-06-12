/**
 * Attendance-hours helpers.
 *
 * Per-entry `hoursLogged` is a Prisma `Decimal` and therefore arrives as a
 * *string* over JSON — every helper here coerces defensively so hours are summed
 * numerically, never string-concatenated (the same trap that corrupted the
 * quality average; see ./quality.ts). Cumulative hours count only *submitted+*
 * entries: an unsubmitted draft has not logged attendance yet.
 */

/** Coerce a raw hours value (number | string | Prisma.Decimal | null) to a finite, non-negative number, or null. */
export function toHoursNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Sum a list of raw per-entry hours, ignoring null/invalid values. Rounded to 2 dp. */
export function sumHours(raws: unknown[]): number {
  const total = raws.reduce<number>((acc, raw) => {
    const n = toHoursNumber(raw);
    return n === null ? acc : acc + n;
  }, 0);
  return Math.round(total * 100) / 100;
}

/** Expected cumulative hours: per-week minimum × expected weeks. 0 when either is unset. */
export function expectedHours(perWeekMin: number, weeks: number): number {
  const min = Number.isFinite(perWeekMin) && perWeekMin > 0 ? perWeekMin : 0;
  const w = Number.isFinite(weeks) && weeks > 0 ? weeks : 0;
  return Math.round(min * w * 100) / 100;
}

export interface HoursSummary {
  logged: number; // cumulative hours on submitted+ entries
  expected: number; // perWeekMin × expected weeks (0 when no minimum configured)
  perWeekMin: number; // the configured per-week minimum
  shortfall: boolean; // expected > 0 && logged < expected
}

/**
 * Cumulative attendance summary for a placement. `rawLoggedHours` must already
 * be filtered to the submitted+ entries the caller wants counted; this function
 * only validates and aggregates. Never flags a shortfall when no minimum is
 * configured (expected = 0).
 */
export function hoursSummary(opts: {
  rawLoggedHours: unknown[];
  perWeekMin: number;
  weeks: number;
}): HoursSummary {
  const logged = sumHours(opts.rawLoggedHours);
  const perWeekMin =
    Number.isFinite(opts.perWeekMin) && opts.perWeekMin > 0 ? opts.perWeekMin : 0;
  const expected = expectedHours(perWeekMin, opts.weeks);
  return {
    logged,
    expected,
    perWeekMin,
    shortfall: expected > 0 && logged < expected,
  };
}

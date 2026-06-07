import { AppError } from '../../middleware/errorHandler';

// Timezone-safe date-only handling. Activity/period dates are calendar dates,
// not instants — we pin them to UTC midnight so the server's local timezone can
// never shift a date across midnight (e.g. storing 2026-03-02 as 2026-03-01).
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a strict 'YYYY-MM-DD' string into a Date at UTC midnight. */
export function parseDateOnly(value: string, field = 'date'): Date {
  if (!DATE_ONLY_RE.test(value)) {
    throw new AppError(422, `Invalid ${field} '${value}': expected YYYY-MM-DD`);
  }
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(422, `Invalid ${field} '${value}'`);
  }
  // Round-trip guard rejects non-calendar dates like 2026-02-31 (which JS would
  // otherwise roll forward to 2026-03-03).
  if (d.toISOString().slice(0, 10) !== value) {
    throw new AppError(422, `Invalid calendar ${field} '${value}'`);
  }
  return d;
}

/** Today as a UTC-midnight Date, for TZ-safe date-only comparisons. */
export function todayUtc(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** True if the date-only value is strictly after today (UTC). */
export function isFuture(d: Date): boolean {
  return d.getTime() > todayUtc().getTime();
}

/** Whole days between two UTC-midnight dates (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Quality-score + week-progress helpers.
 *
 * Centralises every numeric rule about logbook quality scores so the same
 * validation/aggregation runs everywhere (AI ingestion guard, dashboards) and
 * is unit-testable. `qualityScore` is a Prisma `Decimal` and therefore arrives
 * as a *string* over JSON — every helper here coerces defensively so a value is
 * never string-concatenated into an aggregate (the original dashboard bug).
 */

export const QUALITY_MIN = 0;
export const QUALITY_MAX = 100;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * System-wide internship length. The placement is a fixed 6-week programme;
 * no derived count may ever exceed this, regardless of dates or config. This is
 * the single source of truth for "6 weeks" on the backend.
 */
export const SYSTEM_MAX_WEEKS = 6;
const DEFAULT_TOTAL_WEEKS = SYSTEM_MAX_WEEKS;

/** Coerce a raw score (number | string | Prisma.Decimal | null) to a finite number, or null. */
export function toQualityNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A score counts only if it is finite and within [0, 100]. */
export function isValidQualityScore(n: number | null): n is number {
  return n !== null && n >= QUALITY_MIN && n <= QUALITY_MAX;
}

/** Clamp a raw score into [0, 100]. Returns null if it can't be coerced to a number. */
export function clampQualityScore(raw: unknown): number | null {
  const n = toQualityNumber(raw);
  if (n === null) return null;
  return Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, n));
}

/**
 * Numeric mean of per-log quality scores, rounded to one decimal.
 *
 * Null / unscored AND out-of-range values are excluded from BOTH the numerator
 * and the denominator, so corrupt data can neither be counted nor inflate the
 * average. Returns null when no log carries a valid score (caller renders "—").
 * The result is inherently within [0, 100]; it is clamped defensively anyway so
 * an out-of-range aggregate can never reach the UI.
 */
export function meanQualityScore(rawScores: unknown[]): number | null {
  const valid = rawScores.map(toQualityNumber).filter(isValidQualityScore);
  if (valid.length === 0) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const clamped = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, mean));
  return Math.round(clamped * 10) / 10;
}

/** Whole weeks spanned by [start, end], minimum 1. */
export function weeksBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / WEEK_MS));
}

/**
 * Expected number of logbook weeks for a placement.
 *
 * Derived from the actual start/end dates first, so the displayed period can
 * never contradict the dates shown next to it. Falls back to the cohort's
 * configured `totalWeeks`, then to the default, only when the date span is
 * unusable. The result is always capped at SYSTEM_MAX_WEEKS — the internship is
 * a fixed 6-week programme, so nothing above six can ever surface.
 */
export function expectedWeeks(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  totalWeeksConfig?: number | null,
): number {
  let raw = DEFAULT_TOTAL_WEEKS;
  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s) {
      raw = weeksBetween(s, e);
    } else if (totalWeeksConfig && totalWeeksConfig > 0) {
      raw = totalWeeksConfig;
    }
  } else if (totalWeeksConfig && totalWeeksConfig > 0) {
    raw = totalWeeksConfig;
  }
  return Math.min(SYSTEM_MAX_WEEKS, raw);
}

/**
 * "Week N of M" progress. `total` is the expected week count (date-derived, see
 * expectedWeeks); `current` is the number of submitted logs, capped at `total`
 * so the indicator can never exceed the internship length.
 */
export function weekProgress(opts: {
  startDate: Date | string | null | undefined;
  endDate: Date | string | null | undefined;
  totalWeeksConfig?: number | null;
  submittedCount: number;
}): { current: number; total: number } {
  const total = expectedWeeks(opts.startDate, opts.endDate, opts.totalWeeksConfig);
  const current = Math.max(0, Math.min(opts.submittedCount, total));
  return { current, total };
}

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
 * Absolute sanity ceiling on any derived week count — NOT the programme length.
 *
 * It used to be 6, described as "the internship is a fixed 6-week programme".
 * It is not: `CohortConfig.durationWeeks` is coordinator-configured (schema
 * default 6, cohorts run 24) and is what the logbook itself enforces. Capping
 * every dashboard at 6 meant a 24-week cohort read "week 6 of 6" from its
 * seventh week onward, and engagement percentages hit 100% four times over.
 * The programme length now comes from the cohort (`durationWeeksByAcademicYear`
 * in modules/entries/entries.week.ts); this only stops an absurd date span from
 * rendering a nonsense figure.
 */
export const SYSTEM_MAX_WEEKS = 52;

/** Mirrors `CohortConfig.durationWeeks`'s schema default, for the no-config case. */
const DEFAULT_TOTAL_WEEKS = 5;

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

/**
 * Extract the overall score from a v2 `ai_assessment.quality` JSONB payload.
 *
 * The v2 enrichment pipeline (S81) writes `{ overall, task_depth, … }` to
 * `ai_assessment.quality`; the legacy `logbook_analyses` writer was retired in
 * S82, so this is where NEW quality signal lives. The payload is Zod-validated
 * at write time, but this reader still treats it as untrusted (hard rule:
 * validate every AI-originated value) — anything non-object, missing, or
 * out-of-range yields null and is excluded from aggregates.
 */
export function v2QualityOverall(quality: unknown): number | null {
  if (typeof quality !== 'object' || quality === null || Array.isArray(quality)) return null;
  const n = toQualityNumber((quality as Record<string, unknown>).overall);
  return isValidQualityScore(n) ? n : null;
}

/** Shape of the entries relation each aggregate site selects for v2 quality. */
export interface EntryWithLatestAssessment {
  assessments?: { quality: unknown }[];
}

/**
 * Merge legacy and v2 quality scores into one raw list for meanQualityScore.
 *
 * Legacy: `logbook_analyses.qualityScore` per submission (frozen history —
 * writer retired S82). V2: the LATEST `ai_assessment.quality.overall` per
 * weekly entry (callers select `assessments … orderBy createdAt desc, take 1`).
 * Both streams describe the same 0–100 advisory quality of one logged week, so
 * a single mean over the union keeps dashboards honest across the pipeline
 * switch instead of freezing at the legacy data.
 */
export function mergedQualityScores(
  legacyScores: unknown[],
  entries: EntryWithLatestAssessment[],
): (number | null)[] {
  return [
    ...legacyScores.map(toQualityNumber),
    ...entries.map((e) => v2QualityOverall(e.assessments?.[0]?.quality)),
  ];
}

/** Whole weeks spanned by [start, end], minimum 1. */
export function weeksBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / WEEK_MS));
}

/**
 * Expected number of logbook weeks for a placement.
 *
 * **The cohort's configured length wins.** This used to derive the answer from
 * the placement's start/end dates FIRST and consult the configuration only when
 * the dates were unusable — so a cohort configured for 5 weeks whose placement
 * dates happened to span 6 rendered "week 3 of 6" while every rule in the
 * system (the logbook's week ceiling, `weeksDue`, the compliance denominator)
 * enforced 5. One programme cannot be two lengths.
 *
 * The date span is now only a fallback, for placements whose cohort has no
 * configuration at all. SYSTEM_MAX_WEEKS remains a sanity bound, nothing more.
 */
export function expectedWeeks(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  configuredWeeks?: number | null,
): number {
  let raw = DEFAULT_TOTAL_WEEKS;
  if (configuredWeeks && configuredWeeks > 0) {
    raw = configuredWeeks;
  } else if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e > s) {
      raw = weeksBetween(s, e);
    }
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
  configuredWeeks?: number | null;
  submittedCount: number;
}): { current: number; total: number } {
  const total = expectedWeeks(opts.startDate, opts.endDate, opts.configuredWeeks);
  const current = Math.max(0, Math.min(opts.submittedCount, total));
  return { current, total };
}

/**
 * Weeks of a programme that have actually come DUE by `today`, capped at its
 * configured length.
 *
 * Engagement is "how much of what you owe have you handed in", and what you owe
 * grows a week at a time. Dividing submissions by the WHOLE programme instead
 * made every intern look at risk until their final week — invisible while the
 * programme was assumed to be 6 weeks long, glaring at 24. Returns 0 before the
 * first full week has elapsed: nothing is owed yet, so there is no percentage
 * to render (show "—", per the no-impossible-metrics rule).
 */
export function weeksDue(
  startDate: Date | string | null | undefined,
  programmeWeeks: number,
  today: Date = new Date(),
): number {
  if (!startDate) return 0;
  const s = new Date(startDate);
  if (Number.isNaN(s.getTime())) return 0;
  const elapsed = Math.floor((today.getTime() - s.getTime()) / WEEK_MS);
  const cap = Math.min(Math.max(0, programmeWeeks), SYSTEM_MAX_WEEKS);
  return Math.max(0, Math.min(elapsed, cap));
}

/** Engagement %, or null when nothing is due yet — never a misleading 0 or 100. */
export function engagementPercent(submitted: number, due: number): number | null {
  if (due <= 0) return null;
  return Math.min(100, Math.round((Math.max(0, submitted) / due) * 100));
}

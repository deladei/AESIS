import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { parseDateOnly } from './entry.dates';

/**
 * The upper bound on a week number is the COHORT's configured attachment
 * length — `CohortConfig.durationWeeks` — never a literal in a Zod schema.
 *
 * Before this, `entries.schema.ts` hardcoded `max(6)` while a cohort could be
 * configured for 24 weeks, so week 7 was unsaveable no matter what the
 * coordinator configured. The Zod ceiling (52) now only stops absurd input; the
 * real rule lives here, where the cohort is known.
 *
 * Mirrors the SIWES pipeline, which already rejects a week beyond the
 * attachment span with the same 422.
 */
// Matches the schema default on `CohortConfig.durationWeeks`. Used only when a
// cohort has no configuration row at all; a configured cohort always wins.
export const DEFAULT_DURATION_WEEKS = 5;

export async function cohortDurationWeeks(
  placementId: string,
  client: { placement: typeof prisma.placement; cohortConfig: typeof prisma.cohortConfig } = prisma,
): Promise<number> {
  const placement = await client.placement.findUnique({
    where: { id: placementId },
    select: { academicYearId: true },
  });
  if (!placement) return DEFAULT_DURATION_WEEKS;

  const config = await client.cohortConfig.findFirst({
    where: { academicYearId: placement.academicYearId },
    select: { durationWeeks: true },
  });
  return config?.durationWeeks ?? DEFAULT_DURATION_WEEKS;
}

export async function assertWeekWithinCohort(
  placementId: string,
  weekNumber: number,
  client?: { placement: typeof prisma.placement; cohortConfig: typeof prisma.cohortConfig },
): Promise<void> {
  const durationWeeks = await cohortDurationWeeks(placementId, client);
  if (weekNumber > durationWeeks) {
    throw new AppError(422, `This attachment runs for ${durationWeeks} week(s)`);
  }
}

/**
 * The same rule for a LIST of placements, in one query instead of N.
 *
 * The dashboards (coordinator, admin, insights, risk) all render "week X of Y"
 * across cohorts, and every one of them used to print a hardcoded 6 — so a
 * 24-week cohort was told it had finished four times over. They now look the
 * length up per academic year, which is where a coordinator actually configures
 * it.
 *
 * Keyed on academicYearId, not placementId: cohort config is per year, so one
 * lookup serves every placement in it.
 */
export async function durationWeeksByAcademicYear(
  academicYearIds: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const ids = [...new Set(academicYearIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();

  const configs = await prisma.cohortConfig.findMany({
    where: { academicYearId: { in: ids } },
    select: { academicYearId: true, durationWeeks: true },
  });
  return new Map(configs.map((c) => [c.academicYearId, c.durationWeeks]));
}

/** A cohort's attachment length, or the schema default when it has no config. */
export function weeksForYear(
  weeksByYear: Map<string, number>,
  academicYearId: string | null | undefined,
): number {
  const n = academicYearId ? weeksByYear.get(academicYearId) : undefined;
  return n && n > 0 ? n : DEFAULT_DURATION_WEEKS;
}

// ── Week bounds ───────────────────────────────────────────────

const DAY_MS = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Resolve the supersedes chain to its root and return its start date, pinned to
 * UTC midnight.
 *
 * The attachment is continuous across an approved transfer, so every date and
 * week rule anchors on the FIRST placement's start date — week numbering never
 * resets. Lives here rather than in `siwes.service` because the entries writers
 * need it too, and `siwes.service` already imports from this module (importing
 * back would be a cycle).
 */
export async function resolveChainStart(placement: {
  id: string;
  startDate: Date | null;
  supersedesPlacementId: string | null;
}): Promise<Date> {
  let current = placement;
  const seen = new Set<string>([placement.id]);
  while (current.supersedesPlacementId) {
    const parent = await prisma.placement.findUnique({
      where:  { id: current.supersedesPlacementId },
      select: { id: true, startDate: true, supersedesPlacementId: true },
    });
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  if (!current.startDate) {
    throw new AppError(409, 'The attachment has no configured start date');
  }
  return parseDateOnly(iso(current.startDate), 'startDate');
}

/** Week N of an attachment anchored on `chainStart`: [start, start+6]. */
export function weekBoundsFrom(chainStart: Date, weekNumber: number): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(chainStart.getTime() + (weekNumber - 1) * 7 * DAY_MS);
  return { periodStart, periodEnd: new Date(periodStart.getTime() + 6 * DAY_MS) };
}

/**
 * THE server-side derivation of a week's date range.
 *
 * Three writers used to derive these independently and two of them trusted
 * client-supplied bounds (`entries.day.service`, `entries.service`), so
 * whichever path first created the row decided the week's dates — and
 * `deadlineReminder` and `weekAutoSubmit`, which both key on `periodEnd`, fired
 * against whatever that happened to be. The client no longer gets a say.
 */
export async function weekBoundsFor(
  placementId: string,
  weekNumber: number,
): Promise<{ periodStart: Date; periodEnd: Date }> {
  const placement = await prisma.placement.findUniqueOrThrow({
    where:  { id: placementId },
    select: { id: true, startDate: true, supersedesPlacementId: true },
  });
  return weekBoundsFrom(await resolveChainStart(placement), weekNumber);
}

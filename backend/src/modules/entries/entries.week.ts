import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';

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

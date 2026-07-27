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
export const DEFAULT_DURATION_WEEKS = 6;

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

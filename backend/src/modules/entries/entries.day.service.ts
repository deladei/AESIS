import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { parseDateOnly, isFuture, todayUtc, daysBetween } from './entry.dates';
import { authorizePlacement, assertPlacementAccess, type Actor } from './entries.policy';
import { assertWeekWithinCohort, weekBoundsFor } from './entries.week';
import type { SaveDayInput } from './entries.schema';

// Anti-cheat transparency: a day submitted within this grace window of its own
// date is on time. A forgotten day can still be submitted later — it is never
// hard-blocked — but anything after its own date is flagged `loggedLate` so the
// supervisor sees logged-vs-actual. Only future days are rejected.
export const DAY_GRACE_DAYS = 2;

/**
 * Pure window check (date-only, UTC days). A day is submittable on its own date
 * or any day after; never in the future. `loggedLate` is true whenever it's
 * submitted after its own date, so late backfills reach the supervisor flagged.
 * Extracted pure so the rule is unit-tested without a database.
 */
export function evaluateDayWindow(date: Date, today: Date): {
  future: boolean; blocked: boolean; lateBy: number; loggedLate: boolean;
} {
  const lateBy = daysBetween(date, today); // today − date, in whole days
  const future = lateBy < 0;
  return { future, blocked: future, lateBy, loggedLate: lateBy > 0 };
}

// A week entry returned to the API alongside its per-day state. Reused by the
// student day flow and the supervisor review (late flags).
const DAY_ENTRY_INCLUDE = {
  activities: { orderBy: { activityDate: 'asc' } },
  reflection: true,
  days: { orderBy: { workDate: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} as const;

/**
 * Save one day's draft. Upserts the owning week entry (draft), then replaces just
 * THIS day's activities — other days are untouched — and upserts the day row as a
 * draft. A day already submitted can't be re-edited unless the week was returned.
 */
export async function saveDayDraft(actor: Actor, input: SaveDayInput) {
  await authorizePlacement(actor, input.placementId, 'write');
  await assertWeekWithinCohort(input.placementId, input.weekNumber);

  const date = parseDateOnly(input.date, 'date');
  // Derived from the attachment's chain start, never from the request. The
  // client used to supply these and whichever writer created the row first
  // decided the week's dates for everyone downstream.
  const { periodStart, periodEnd } = await weekBoundsFor(input.placementId, input.weekNumber);
  if (date.getTime() < periodStart.getTime() || date.getTime() > periodEnd.getTime()) {
    throw new AppError(422, 'That day is outside this week');
  }
  if (isFuture(date)) throw new AppError(422, 'You cannot log a day in the future');

  return prisma.$transaction(async (tx) => {
    const placement = await tx.placement.findUniqueOrThrow({
      where: { id: input.placementId },
      select: { studentId: true },
    });

    const entry = await tx.logbookEntry.upsert({
      where: { studentId_weekNumber: { studentId: placement.studentId, weekNumber: input.weekNumber } },
      create: {
        placementId: input.placementId,
        studentId: placement.studentId,
        weekNumber: input.weekNumber,
        periodStart,
        periodEnd,
        status: 'draft',
      },
      update: {},
    });
    if (entry.status === 'acknowledged') {
      throw new AppError(409, 'This week has been acknowledged and is locked');
    }

    const existingDay = await tx.dailyEntry.findUnique({
      where: { studentId_workDate: { studentId: placement.studentId, workDate: date } },
    });
    if (existingDay?.status === 'submitted' && entry.status !== 'returned') {
      throw new AppError(409, 'This day is already submitted; it cannot be edited');
    }

    // Replace this day's activities only (leave the other weekdays intact).
    await tx.entryActivity.deleteMany({ where: { entryId: entry.id, activityDate: date } });
    if (input.activities.length > 0) {
      await tx.entryActivity.createMany({
        data: input.activities.map((a) => ({
          entryId: entry.id, activityDate: date, description: a.description, competencyTags: a.competencyTags,
        })),
      });
    }

    await tx.dailyEntry.upsert({
      where: { studentId_workDate: { studentId: placement.studentId, workDate: date } },
      create: {
        entryId: entry.id,
        studentId: placement.studentId,
        placementId: input.placementId,
        weekNumber: input.weekNumber,
        workDate: date,
        status: 'draft',
      },
      // Saving a day must not un-submit it. This used to force
      // `status: 'draft', submittedAt: null`, and the editor calls this route on
      // effectively every save — so editing a typo in a submitted day silently
      // withdrew it. The SIWES writer never touched status; now neither does this.
      update: {},
    });

    return tx.logbookEntry.findUniqueOrThrow({ where: { id: entry.id }, include: DAY_ENTRY_INCLUDE });
  });
}

/**
 * Submit one day: enforce the anti-cheat window and stamp the day submitted.
 * That is all it does.
 *
 * It deliberately does NOT transition the week. Students work two ways — day by
 * day, or write the week and send it whole — and both are offered. When the day
 * path also flipped the week to `submitted`, the first "Submit day" silently
 * spent the student's one week-level submit: the "Submit week" button, the
 * completed-week offer and the deadline safety net (`jobs/weekAutoSubmit.ts`)
 * all gate on `draft`, so the choice was fake. Sending the week is now always
 * the student's own act (or the deadline job's, on their behalf).
 *
 * `submitEntry` owns the week transition, the append-only event, the enrichment
 * enqueue and the supervisor notification — so the supervisor is pinged once,
 * when a whole week arrives, instead of on a stray first day.
 *
 * Lateness is not stamped here either: it is derived from the immutable
 * `created_at`, so a late backfill can't be laundered by re-submitting.
 */
export async function submitDay(actor: Actor, entryId: string, dateStr: string) {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    include: {
      placement: { select: { id: true, studentId: true, academicSupervisorId: true, companySupervisorId: true } },
    },
  });
  if (!entry) throw new AppError(404, 'Logbook entry not found');
  assertPlacementAccess(actor, entry.placement, 'write');
  if (entry.status === 'acknowledged') {
    throw new AppError(409, 'This week has been acknowledged and is locked');
  }

  const date = parseDateOnly(dateStr, 'date');
  const window = evaluateDayWindow(date, todayUtc());
  if (window.future) throw new AppError(422, 'You cannot submit a day in the future');

  return prisma.$transaction(async (tx) => {
    await tx.dailyEntry.upsert({
      where: { studentId_workDate: { studentId: entry.placement.studentId, workDate: date } },
      create: {
        entryId,
        studentId: entry.placement.studentId,
        placementId: entry.placement.id,
        weekNumber: entry.weekNumber,
        workDate: date,
        status: 'submitted',
        submittedAt: new Date(),
      },
      update: { status: 'submitted', submittedAt: new Date() },
    });

    return tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: DAY_ENTRY_INCLUDE });
  });
}

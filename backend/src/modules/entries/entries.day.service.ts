import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { parseDateOnly, isFuture, todayUtc, daysBetween } from './entry.dates';
import { authorizePlacement, assertPlacementAccess, type Actor } from './entries.policy';
import type { SaveDayInput } from './entries.schema';

// Anti-cheat transparency: a day may be submitted on its own date or within this
// grace window — never in the future, never long after the fact. Stops a student
// backfilling a whole internship at the end. Days submitted after their own date
// are flagged `loggedLate` so the supervisor sees logged-vs-actual.
export const DAY_GRACE_DAYS = 2;

/**
 * Pure anti-cheat window check (date-only, UTC days). A day is submittable on its
 * own date through `DAY_GRACE_DAYS` after; never in the future, never beyond the
 * grace window. `loggedLate` is true whenever it's submitted after its own date.
 * Extracted pure so the rule is unit-tested without a database.
 */
export function evaluateDayWindow(date: Date, today: Date): {
  future: boolean; blocked: boolean; lateBy: number; loggedLate: boolean;
} {
  const lateBy = daysBetween(date, today); // today − date, in whole days
  const future = lateBy < 0;
  return { future, blocked: future || lateBy > DAY_GRACE_DAYS, lateBy, loggedLate: lateBy > 0 };
}

// A week entry returned to the API alongside its per-day state. Reused by the
// student day flow and the supervisor review (late flags).
const DAY_ENTRY_INCLUDE = {
  activities: { orderBy: { activityDate: 'asc' } },
  reflection: true,
  days: { orderBy: { date: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} as const;

/**
 * Save one day's draft. Upserts the owning week entry (draft), then replaces just
 * THIS day's activities — other days are untouched — and upserts the day row as a
 * draft. A day already submitted can't be re-edited unless the week was returned.
 */
export async function saveDayDraft(actor: Actor, input: SaveDayInput) {
  await authorizePlacement(actor, input.placementId, 'write');

  const date = parseDateOnly(input.date, 'date');
  const periodStart = parseDateOnly(input.periodStart, 'periodStart');
  const periodEnd = parseDateOnly(input.periodEnd, 'periodEnd');
  if (date.getTime() < periodStart.getTime() || date.getTime() > periodEnd.getTime()) {
    throw new AppError(422, 'That day is outside this week');
  }
  if (isFuture(date)) throw new AppError(422, 'You cannot log a day in the future');

  return prisma.$transaction(async (tx) => {
    const entry = await tx.logbookEntry.upsert({
      where: { placementId_weekNumber: { placementId: input.placementId, weekNumber: input.weekNumber } },
      create: { placementId: input.placementId, weekNumber: input.weekNumber, periodStart, periodEnd, status: 'draft' },
      update: {},
    });
    if (entry.status === 'acknowledged') {
      throw new AppError(409, 'This week has been acknowledged and is locked');
    }

    const existingDay = await tx.entryDay.findUnique({
      where: { entryId_date: { entryId: entry.id, date } },
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

    await tx.entryDay.upsert({
      where: { entryId_date: { entryId: entry.id, date } },
      create: { entryId: entry.id, date, status: 'draft' },
      update: { status: 'draft', submittedAt: null, loggedLate: false },
    });

    return tx.logbookEntry.findUniqueOrThrow({ where: { id: entry.id }, include: DAY_ENTRY_INCLUDE });
  });
}

/**
 * Submit one day. Enforces the anti-cheat window, stamps the day submitted +
 * `loggedLate`, and rolls the WEEK into review on the first submitted day
 * (enqueues enrichment + pings the supervisor once). Subsequent day submits in an
 * already-submitted week just mark the day — the week stays in review until the
 * supervisor acknowledges it.
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
  if (window.blocked) {
    throw new AppError(
      422,
      `The logging window for this day has closed — it was ${window.lateBy} days ago (max ${DAY_GRACE_DAYS}).`,
    );
  }
  const loggedLate = window.loggedLate;
  const supervisorId = entry.placement.academicSupervisorId;
  const wasInReview = entry.status === 'submitted';

  const result = await prisma.$transaction(async (tx) => {
    await tx.entryDay.upsert({
      where: { entryId_date: { entryId, date } },
      create: { entryId, date, status: 'submitted', submittedAt: new Date(), loggedLate },
      update: { status: 'submitted', submittedAt: new Date(), loggedLate },
    });

    let notification = null;
    // First submitted day in a not-yet-in-review week → move the week to review.
    if (!wasInReview) {
      await tx.logbookEntry.update({
        where: { id: entryId },
        data: { status: 'submitted', submittedAt: new Date() },
      });
      await tx.entryEvent.create({
        data: {
          entryId, actorId: actor.id, actorRole: actor.role,
          eventType: 'transitioned', fromStatus: entry.status, toStatus: 'submitted',
        },
      });
      await tx.enrichmentQueue.create({ data: { entryId, status: 'pending' } });
      if (supervisorId) {
        notification = await tx.notification.create({
          data: {
            userId: supervisorId,
            type: 'submission_reminder',
            title: `Week ${entry.weekNumber} ready for review`,
            body: 'A logbook week now has submitted days ready for your review.',
            link: '/supervisor/review',
            metadata: { entryId, weekNumber: entry.weekNumber, placementId: entry.placement.id, studentId: entry.placement.studentId },
          },
        });
      }
    }

    const e = await tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: DAY_ENTRY_INCLUDE });
    return { entry: e, notification };
  });

  if (result.notification && supervisorId) {
    emitToUser(supervisorId, 'notification:new', {
      id: result.notification.id,
      type: result.notification.type,
      title: result.notification.title,
      body: result.notification.body,
      link: result.notification.link,
      createdAt: result.notification.createdAt,
    });
  }

  return result.entry;
}

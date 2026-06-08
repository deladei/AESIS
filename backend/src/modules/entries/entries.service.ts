import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { emitToUser } from '../../shared/utils/socketEmitter';
import {
  resolveTransition,
  isEditable,
  type EntryStatus,
  type TransitionAction,
} from './entry.stateMachine';
import { parseDateOnly, isFuture, todayUtc, daysBetween } from './entry.dates';
import {
  authorizePlacement,
  entryScopeFilter,
  assertPlacementAccess,
  type Actor,
} from './entries.policy';
import type { SaveDraftInput, ReturnInput, AcknowledgeInput, ListQuery } from './entries.schema';

const ENTRY_INCLUDE = {
  activities: { orderBy: { activityDate: 'asc' } },
  reflection: true,
} satisfies Prisma.LogbookEntryInclude;

// ── Helpers ───────────────────────────────────────────────────

// Load an entry together with the placement-ownership fields needed for authz.
async function loadEntryWithOwnership(entryId: string) {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    include: {
      placement: {
        select: {
          id: true,
          studentId: true,
          academicSupervisorId: true,
          companySupervisorId: true,
        },
      },
      _count: { select: { activities: true } },
    },
  });
  if (!entry) throw new AppError(404, 'Logbook entry not found');
  return entry;
}

function validateDraftDates(input: SaveDraftInput) {
  const periodStart = parseDateOnly(input.periodStart, 'periodStart');
  const periodEnd = parseDateOnly(input.periodEnd, 'periodEnd');
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new AppError(422, 'periodEnd cannot be before periodStart');
  }
  const activities = input.activities.map((a) => {
    const activityDate = parseDateOnly(a.activityDate, 'activityDate');
    if (isFuture(activityDate)) {
      throw new AppError(422, `Activity date ${a.activityDate} is in the future`);
    }
    return { activityDate, description: a.description, competencyTags: a.competencyTags };
  });
  return { periodStart, periodEnd, activities };
}

// ── WRITE PATH (Path 1 — must never fail; no AI, no company-sup dependency) ──

/**
 * Create or update a weekly draft. Editing a `returned` entry performs the
 * returned -> draft reopen (version bump + event) atomically with the edit.
 * Rejects edits to submitted/acknowledged weeks. Idempotent by (placement, week).
 */
export async function saveDraft(actor: Actor, input: SaveDraftInput) {
  await authorizePlacement(actor, input.placementId, 'write');
  const { periodStart, periodEnd, activities } = validateDraftDates(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.logbookEntry.findUnique({
      where: {
        placementId_weekNumber: {
          placementId: input.placementId,
          weekNumber: input.weekNumber,
        },
      },
    });

    let entryId: string;

    if (!existing) {
      // Genesis: create the entry in draft and log the null -> draft event.
      const created = await tx.logbookEntry.create({
        data: {
          placementId: input.placementId,
          weekNumber: input.weekNumber,
          periodStart,
          periodEnd,
          hoursLogged: input.hoursLogged,
          status: 'draft',
        },
      });
      entryId = created.id;
      await tx.entryEvent.create({
        data: { entryId, actorId: actor.id, fromStatus: null, toStatus: 'draft' },
      });
    } else {
      const status = existing.status as EntryStatus;
      if (!isEditable(status)) {
        throw new AppError(
          409,
          status === 'acknowledged'
            ? 'This week is acknowledged and locked; it can no longer be edited'
            : 'This week has been submitted and is awaiting review; it cannot be edited',
        );
      }
      entryId = existing.id;

      if (status === 'returned') {
        // Reopen: returned -> draft, bump version, log the transition.
        resolveTransition(status, 'reopen', actor.role);
        await tx.logbookEntry.update({
          where: { id: entryId },
          data: {
            status: 'draft',
            version: { increment: 1 },
            periodStart,
            periodEnd,
            hoursLogged: input.hoursLogged,
          },
        });
        await tx.entryEvent.create({
          data: { entryId, actorId: actor.id, fromStatus: 'returned', toStatus: 'draft' },
        });
      } else {
        // Plain draft edit — no transition.
        await tx.logbookEntry.update({
          where: { id: entryId },
          data: { periodStart, periodEnd, hoursLogged: input.hoursLogged },
        });
      }
    }

    // Activities are a full replace on each save.
    await tx.entryActivity.deleteMany({ where: { entryId } });
    if (activities.length > 0) {
      await tx.entryActivity.createMany({
        data: activities.map((a) => ({ entryId, ...a })),
      });
    }

    // Reflection upsert (optional).
    if (input.reflection) {
      await tx.entryReflection.upsert({
        where: { entryId },
        create: { entryId, ...input.reflection },
        update: { ...input.reflection },
      });
    }

    return tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE });
  });
}

/**
 * Submit a draft. Synchronous and must never depend on AI or the company
 * supervisor. Idempotent: a double-submit produces no second event/enqueue.
 * Enrichment is enqueued via a transactional-outbox row (same tx) — no external
 * call happens on the write path; the worker makes the HTTP call later.
 */
export async function submitEntry(actor: Actor, entryId: string) {
  const loaded = await loadEntryWithOwnership(entryId);
  assertPlacementAccess(actor, loaded.placement, 'transition');
  const supervisorId = loaded.placement.academicSupervisorId;

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row so concurrent double-submits serialize.
    await tx.$queryRaw`SELECT id FROM logbook_entry WHERE id = ${entryId} FOR UPDATE`;

    const entry = await tx.logbookEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { _count: { select: { activities: true } } },
    });
    const status = entry.status as EntryStatus;

    // Idempotent no-op: already submitted -> return as-is, no duplicate event/notification.
    if (status === 'submitted') {
      const e = await tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE });
      return { entry: e, notification: null };
    }

    resolveTransition(status, 'submit', actor.role); // 409 if not from draft

    if (entry._count.activities === 0) {
      throw new AppError(422, 'Cannot submit an empty logbook week — add at least one activity');
    }

    if (env.BACKFILL_CUTOFF_DAYS !== undefined) {
      const lateBy = daysBetween(entry.periodEnd, todayUtc());
      if (lateBy > env.BACKFILL_CUTOFF_DAYS) {
        throw new AppError(
          422,
          `This week ended ${lateBy} days ago, beyond the ${env.BACKFILL_CUTOFF_DAYS}-day backfill cutoff`,
        );
      }
    }

    await tx.logbookEntry.update({
      where: { id: entryId },
      data: { status: 'submitted', submittedAt: new Date() },
    });
    await tx.entryEvent.create({
      data: { entryId, actorId: actor.id, fromStatus: status, toStatus: 'submitted' },
    });

    // Transactional outbox: enqueue enrichment atomically with the submit so it
    // is never lost, yet the AI call itself stays off the write path.
    await tx.enrichmentQueue.create({ data: { entryId, status: 'pending' } });

    // Notify the assigned academic supervisor that a week is ready to review.
    // Written in the same tx so the ping is never lost if the submit commits.
    let notification = null;
    if (supervisorId) {
      notification = await tx.notification.create({
        data: {
          userId: supervisorId,
          type: 'submission_reminder',
          title: `Week ${entry.weekNumber} submitted for review`,
          body: `A logbook week has been submitted and is ready for your review.`,
          link: '/supervisor/review',
          metadata: {
            entryId,
            weekNumber: entry.weekNumber,
            placementId: loaded.placement.id,
            studentId: loaded.placement.studentId,
          },
        },
      });
    }

    const e = await tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE });
    return { entry: e, notification };
  });

  // Real-time ping after commit (mirrors the acknowledge/return path).
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

// ── HUMAN WORKFLOW (Path 3 — supervisor acknowledge / return) ──

async function applySupervisorTransition(
  actor: Actor,
  entryId: string,
  action: Extract<TransitionAction, 'acknowledge' | 'return'>,
  opts: { comment?: string; score?: number },
) {
  const loaded = await loadEntryWithOwnership(entryId);
  assertPlacementAccess(actor, loaded.placement, 'transition');

  const notify = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM logbook_entry WHERE id = ${entryId} FOR UPDATE`;
    const entry = await tx.logbookEntry.findUniqueOrThrow({ where: { id: entryId } });
    const status = entry.status as EntryStatus;

    // Acknowledge is idempotent (terminal); return is not.
    if (action === 'acknowledge' && status === 'acknowledged') {
      return null;
    }

    const { to } = resolveTransition(status, action, actor.role);

    let score: number | undefined;
    if (action === 'acknowledge' && env.WEEKLY_BINDING_GRADES) {
      if (opts.score === undefined) {
        throw new AppError(422, 'A score is required to acknowledge (weekly binding grades is on)');
      }
      score = opts.score;
    }

    await tx.logbookEntry.update({ where: { id: entryId }, data: { status: to } });
    await tx.entryEvent.create({
      data: {
        entryId,
        actorId: actor.id,
        fromStatus: status,
        toStatus: to,
        comment: opts.comment ?? null,
        score: score ?? null,
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId: loaded.placement.studentId,
        type: 'feedback_received',
        title:
          action === 'acknowledge'
            ? `Week ${entry.weekNumber} acknowledged`
            : `Week ${entry.weekNumber} returned for revision`,
        body:
          action === 'acknowledge'
            ? `Your supervisor acknowledged your Week ${entry.weekNumber} logbook.`
            : `Your supervisor returned Week ${entry.weekNumber}: ${opts.comment ?? ''}`.trim(),
        link: `/logbook/entries/${entryId}`,
        metadata: { entryId, weekNumber: entry.weekNumber, action },
      },
    });

    return { studentId: loaded.placement.studentId, notification };
  });

  if (notify) {
    emitToUser(notify.studentId, 'notification:new', {
      id: notify.notification.id,
      type: notify.notification.type,
      title: notify.notification.title,
      body: notify.notification.body,
      link: notify.notification.link,
      createdAt: notify.notification.createdAt,
    });
  }

  return prisma.logbookEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE });
}

export function acknowledgeEntry(actor: Actor, entryId: string, input: AcknowledgeInput) {
  return applySupervisorTransition(actor, entryId, 'acknowledge', input);
}

export function returnEntry(actor: Actor, entryId: string, input: ReturnInput) {
  return applySupervisorTransition(actor, entryId, 'return', { comment: input.comment });
}

// ── READS (role-scoped) ───────────────────────────────────────

export async function getEntry(actor: Actor, entryId: string) {
  const entry = await prisma.logbookEntry.findFirst({
    // Scope at the DB layer: even if the check below were missed, the row is
    // already filtered to what this actor may see.
    where: { id: entryId, ...entryScopeFilter(actor) },
    include: {
      activities: { orderBy: { activityDate: 'asc' } },
      reflection: true,
      events: { orderBy: { createdAt: 'asc' } },
      assessments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!entry) throw new AppError(404, 'Logbook entry not found');

  // A company supervisor may not see reflections marked supervisor-only.
  if (actor.role === 'company_supervisor' && entry.reflection && !entry.reflection.supervisorVisible) {
    entry.reflection = null;
  }
  return entry;
}

export async function listEntries(actor: Actor, query: ListQuery) {
  const { skip, take } = paginate(query.page, query.limit);
  const where: Prisma.LogbookEntryWhereInput = {
    ...entryScopeFilter(actor),
    ...(query.placementId && { placementId: query.placementId }),
    ...(query.status && { status: query.status }),
  };

  const [entries, total] = await Promise.all([
    prisma.logbookEntry.findMany({
      where,
      skip,
      take,
      orderBy: [{ placementId: 'asc' }, { weekNumber: 'asc' }],
      include: {
        _count: { select: { activities: true } },
        assessments: { select: { relevance: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        placement: {
          select: {
            id: true,
            student: { select: { id: true, firstName: true, lastName: true, email: true } },
            company: { select: { name: true } },
          },
        },
      },
    }),
    prisma.logbookEntry.count({ where }),
  ]);

  return { entries, meta: buildMeta(total, query.page, query.limit) };
}

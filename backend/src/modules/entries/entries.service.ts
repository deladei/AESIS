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
import { assertWeekWithinCohort } from './entries.week';
import { evaluateWeekCompletion } from './entries.autosubmit';
import { evaluateDayWindow } from './entries.day.service';
import { chainPlacementIds } from '../siwes/siwes.service';
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

// A normalized snapshot of the author-editable fields, stored in the audit
// trail's before/after JSON so an edit's exact change is reconstructable.
type EntryFieldSnapshot = {
  hoursLogged: number | null;
  activities: { activityDate: string; description: string; competencyTags: string[] }[];
  reflection: { learning: string; challenges: string; supervisorVisible: boolean } | null;
};

async function snapshotEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
): Promise<EntryFieldSnapshot> {
  const e = await tx.logbookEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      hoursLogged: true,
      activities: {
        select: { activityDate: true, description: true, competencyTags: true },
        orderBy: { activityDate: 'asc' },
      },
      reflection: { select: { learning: true, challenges: true, supervisorVisible: true } },
    },
  });
  return {
    // Decimal -> number so the snapshot is plain JSON and diff-comparable.
    hoursLogged: e.hoursLogged == null ? null : Number(e.hoursLogged),
    activities: e.activities.map((a) => ({
      activityDate: a.activityDate.toISOString().slice(0, 10),
      description: a.description,
      competencyTags: a.competencyTags,
    })),
    reflection: e.reflection ?? null,
  };
}

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
  // Anti-cheat: a week cannot be logged before it starts — mirrors the per-day
  // path, which rejects future days. Without this the legacy week-level route
  // lets a student pre-fill future weeks.
  if (isFuture(periodStart)) {
    throw new AppError(422, 'This week has not started yet; it cannot be logged in advance');
  }
  const activities = input.activities.map((a) => {
    const activityDate = parseDateOnly(a.activityDate, 'activityDate');
    if (isFuture(activityDate)) {
      throw new AppError(422, `Activity date ${a.activityDate} is in the future`);
    }
    if (
      activityDate.getTime() < periodStart.getTime() ||
      activityDate.getTime() > periodEnd.getTime()
    ) {
      throw new AppError(422, `Activity date ${a.activityDate} is outside this week`);
    }
    return { activityDate, description: a.description, competencyTags: a.competencyTags };
  });
  return { periodStart, periodEnd, activities };
}

/**
 * Walk a placement up its supersedes chain to the root. Two placements are in
 * the same chain when they share a root — that is what makes a transferred
 * student's week 7 the *same* week 7, rather than a collision.
 */
async function chainRootId(
  tx: Prisma.TransactionClient,
  placementId: string,
): Promise<string> {
  let current = placementId;
  const seen = new Set<string>([current]);
  for (;;) {
    const p = await tx.placement.findUnique({
      where: { id: current },
      select: { supersedesPlacementId: true },
    });
    const parent = p?.supersedesPlacementId;
    if (!parent || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

// ── WRITE PATH (Path 1 — must never fail; no AI, no company-sup dependency) ──

/**
 * Create or update a weekly draft. Editing a `returned` entry performs the
 * returned -> draft reopen (version bump + event) atomically with the edit.
 * Rejects edits to submitted/acknowledged weeks. Idempotent by (student, week).
 */
export async function saveDraft(actor: Actor, input: SaveDraftInput) {
  await authorizePlacement(actor, input.placementId, 'write');
  await assertWeekWithinCohort(input.placementId, input.weekNumber);
  const { periodStart, periodEnd, activities } = validateDraftDates(input);

  return prisma.$transaction(async (tx) => {
    // Weeks are keyed on the student, not the placement (S87): week numbers are
    // student-relative so a transfer doesn't restart the logbook at week 1.
    const placement = await tx.placement.findUniqueOrThrow({
      where: { id: input.placementId },
      select: { studentId: true },
    });

    const existing = await tx.logbookEntry.findUnique({
      where: {
        studentId_weekNumber: {
          studentId: placement.studentId,
          weekNumber: input.weekNumber,
        },
      },
    });

    // The week is keyed on the student, so an existing row may belong to another
    // placement. Same supersedes chain = the student transferred and is
    // continuing the same logbook: the week moves to the placement it is now
    // being worked under (which is what `placementId` on the entry records).
    // Unrelated placement = a genuine collision; refuse rather than silently
    // write into another placement's week.
    if (existing && existing.placementId !== input.placementId) {
      const [existingRoot, incomingRoot] = await Promise.all([
        chainRootId(tx, existing.placementId),
        chainRootId(tx, input.placementId),
      ]);
      if (existingRoot !== incomingRoot) {
        throw new AppError(
          409,
          `Week ${input.weekNumber} already exists for this student under an unrelated placement`,
        );
      }
      await tx.logbookEntry.update({
        where: { id: existing.id },
        data: { placementId: input.placementId },
      });
    }

    let entryId: string;
    // When a plain draft edit happens we capture the pre-edit snapshot here and
    // emit the audit `edited` event after the activity/reflection writes below,
    // so before/after reflect the real persisted change.
    let editBefore: EntryFieldSnapshot | null = null;

    if (!existing) {
      // Genesis: create the entry in draft and log the null -> draft event.
      const created = await tx.logbookEntry.create({
        data: {
          placementId: input.placementId,
          studentId: placement.studentId,
          weekNumber: input.weekNumber,
          periodStart,
          periodEnd,
          hoursLogged: input.hoursLogged,
          status: 'draft',
        },
      });
      entryId = created.id;
      await tx.entryEvent.create({
        data: {
          entryId, actorId: actor.id, actorRole: actor.role,
          eventType: 'created', fromStatus: null, toStatus: 'draft',
        },
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
          data: {
            entryId, actorId: actor.id, actorRole: actor.role,
            eventType: 'transitioned', fromStatus: 'returned', toStatus: 'draft',
          },
        });
      } else {
        // Plain draft edit — no transition, but it is audited as `edited`.
        editBefore = await snapshotEntry(tx, entryId);
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

    // Audit a plain draft edit with the persisted before/after snapshot.
    if (editBefore) {
      const editAfter = await snapshotEntry(tx, entryId);
      await tx.entryEvent.create({
        data: {
          entryId, actorId: actor.id, actorRole: actor.role,
          eventType: 'edited', fromStatus: null, toStatus: null,
          before: editBefore as Prisma.InputJsonObject,
          after: editAfter as Prisma.InputJsonObject,
        },
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

    // Anti-cheat: a week that hasn't started can never be submitted (mirrors
    // the per-day submit window).
    if (isFuture(entry.periodStart)) {
      throw new AppError(422, 'This week has not started yet; it cannot be submitted');
    }

    // A week may be submitted with or without activities — the activity list is
    // no longer a submission gate (a student can record a week of hours/reflection
    // without itemising daily activities).

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
      data: {
        entryId, actorId: actor.id, actorRole: actor.role,
        eventType: 'transitioned', fromStatus: status, toStatus: 'submitted',
      },
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

    // The terminal action (acknowledge) is idempotent; return is not.
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
        actorRole: actor.role,
        // A grade write is recorded as `scored`; an unscored move is `transitioned`.
        eventType: score !== undefined ? 'scored' : 'transitioned',
        fromStatus: status,
        toStatus: to,
        comment: opts.comment ?? null,
        score: score ?? null,
      },
    });

    const title =
      action === 'acknowledge'
        ? `Week ${entry.weekNumber} acknowledged`
        : `Week ${entry.weekNumber} returned for revision`;
    const body =
      action === 'acknowledge'
        ? `Your supervisor acknowledged your Week ${entry.weekNumber} logbook.`
        : `Your supervisor returned Week ${entry.weekNumber}: ${opts.comment ?? ''}`.trim();

    const notification = await tx.notification.create({
      data: {
        userId: loaded.placement.studentId,
        type: 'feedback_received',
        title,
        body,
        // The SPA has no /logbook/* route — this used to fall through the
        // catch-all to the dashboard, so a returned week's notification took
        // the student nowhere near the week they had to fix.
        link: `/student/logbook?week=${entry.weekNumber}`,
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
      days: { orderBy: { workDate: 'asc' } },
    },
  });
  if (!entry) throw new AppError(404, 'Logbook entry not found');

  // A company supervisor may not see reflections marked supervisor-only.
  if (actor.role === 'company_supervisor' && entry.reflection && !entry.reflection.supervisorVisible) {
    entry.reflection = null;
  }

  // Plagiarism reports reference other students' entries and the feedback
  // draft is the academic supervisor's to edit (human-in-loop) — neither is
  // for student or company-supervisor eyes. Quality breakdown stays visible.
  if (actor.role === 'student' || actor.role === 'company_supervisor') {
    entry.assessments = entry.assessments.map((a) => ({
      ...a,
      plagiarism: null,
      feedbackDraft: null,
    }));
  }

  // Lateness is DERIVED, never stored — the column was dropped precisely so
  // there is one answer. `created_at` is immutable server evidence of when the
  // day was first logged, so a late backfill stays flagged however often it is
  // re-submitted. Same rule the day window enforces on write and the SIWES
  // calendar shows the student, reused rather than restated.
  // Both sides are normalised to whole UTC days first: `created_at` is a
  // timestamp, and comparing it raw would call a day logged at 20:00 on its own
  // date "one day late" (this is why the SIWES serializer normalises too).
  const dateOnly = (d: Date) => parseDateOnly(d.toISOString().slice(0, 10), 'date');
  const days = entry.days.map((d) => {
    const { lateBy, loggedLate } = evaluateDayWindow(dateOnly(d.workDate), dateOnly(d.createdAt));
    return { ...d, loggedLate, lateByDays: Math.max(0, lateBy) };
  });

  // Whether the week is finished — every working day written up or excused.
  // The logbook needs this on load, not only on the save that completes the
  // week: the student is ASKED to submit rather than having it done under
  // them, so the offer has to survive a reload. Report-only (`null` submit);
  // a week that is no longer a draft can't be submitted, so don't pay for it.
  // `null` rather than an absent key: the field is always part of the shape, so
  // a caller reading it never has to know which branch produced the row.
  // The week's own late headline, rolled up from the same derived day flags so
  // the reviewer's badge can never disagree with the rows under it.
  const lateSummary = {
    lateDays: days.filter((d) => d.loggedLate).length,
    maxDaysLate: days.reduce((m, d) => Math.max(m, d.lateByDays), 0),
  };

  if (entry.status !== 'draft') return { ...entry, days, lateSummary, completion: null };

  const { complete, remaining, workingDays, missingDates } =
    await evaluateWeekCompletion(actor, entry.id, null);
  return {
    ...entry,
    days,
    lateSummary,
    completion: { complete, remaining, workingDays, missingDates },
  };
}

/**
 * The append-only audit trail for a single entry, oldest first. Same read
 * authorization as the entry itself (student/own, assigned academic + company
 * supervisor, coordinator/admin) — no new rule, reuses assertPlacementAccess.
 */
export async function getEntryTrail(actor: Actor, entryId: string) {
  const loaded = await loadEntryWithOwnership(entryId);
  assertPlacementAccess(actor, loaded.placement, 'read');

  const events = await prisma.entryEvent.findMany({
    where: { entryId },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { firstName: true, lastName: true, role: true } } },
  });

  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    actor: {
      id: e.actorId,
      name: `${e.actor.firstName} ${e.actor.lastName}`.trim(),
      // Prefer the role recorded at event time; fall back to the actor's current role.
      role: e.actorRole ?? e.actor.role,
    },
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    comment: e.comment,
    score: e.score == null ? null : Number(e.score),
    before: e.before,
    after: e.after,
    createdAt: e.createdAt,
  }));
}

export async function listEntries(actor: Actor, query: ListQuery) {
  const { skip, take } = paginate(query.page, query.limit);

  // A placement filter means "this student's logbook", and the attachment is
  // continuous across a transfer — weeks are keyed on the student now. Scoping
  // to the single placement id made every pre-transfer week vanish from the
  // list while the week rail (built from the chain-aware calendar) still showed
  // it, so those weeks rendered as never started. `entryScopeFilter` still
  // applies on top, so nobody sees a chain they could not see before.
  const placementIds = query.placementId ? await chainPlacementIds(query.placementId) : null;

  const where: Prisma.LogbookEntryWhereInput = {
    ...entryScopeFilter(actor),
    ...(placementIds && { placementId: { in: placementIds } }),
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
        // Two columns per day, only so the row can carry a late headline. The
        // supervisor's queue has to show lateness BEFORE the week is opened,
        // and without this the list had no day data at all.
        days: { select: { workDate: true, createdAt: true } },
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

  // Same derivation as getEntry — one lateness rule, applied at both altitudes.
  const dateOnly = (d: Date) => parseDateOnly(d.toISOString().slice(0, 10), 'date');
  const rows = entries.map(({ days, ...entry }) => {
    let lateDays = 0;
    let maxDaysLate = 0;
    for (const d of days) {
      const { lateBy, loggedLate } = evaluateDayWindow(dateOnly(d.workDate), dateOnly(d.createdAt));
      if (loggedLate) lateDays += 1;
      maxDaysLate = Math.max(maxDaysLate, lateBy);
    }
    return { ...entry, lateDays, maxDaysLate: Math.max(0, maxDaysLate) };
  });

  return { entries: rows, meta: buildMeta(total, query.page, query.limit) };
}

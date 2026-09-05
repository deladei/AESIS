import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import type { z } from 'zod';
import type { createVisitSchema, updateVisitSchema, completeVisitSchema, cancelVisitSchema } from './visits.schema';

export interface Actor { id: string; role: string }

const VISIT_SELECT = {
  id: true, placementId: true, supervisorId: true, scheduledAt: true, durationMinutes: true,
  visitType: true, location: true, notes: true, completed: true, completedAt: true,
  outcomeNote: true, cancelledAt: true, cancelReason: true,
  placement: {
    select: {
      id: true,
      student: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  },
  supervisor: { select: { id: true, firstName: true, lastName: true } },
} as const;

const isStaff = (a: Actor) => ['coordinator', 'hod', 'admin'].includes(a.role);

/**
 * Who may schedule a review on this placement?
 *
 * The assigned academic supervisor, or the coordinator/HoD/admin. Scope comes
 * from the placement row — never from a client-supplied supervisor id, so a
 * supervisor cannot book a review onto somebody else's student.
 */
async function assertMayScheduleOn(actor: Actor, placementId: string) {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: { id: true, studentId: true, academicSupervisorId: true, finalizationStatus: true },
  });
  if (!placement) throw new AppError(404, 'Placement not found');
  if (isStaff(actor)) return placement;
  if (actor.role === 'academic_supervisor' && placement.academicSupervisorId === actor.id) return placement;
  throw new AppError(403, 'You do not supervise this placement');
}

/** Reviews visible to the caller: a student sees their own, a supervisor theirs. */
export async function listVisits(actor: Actor, opts: { placementId?: string; upcomingOnly?: boolean } = {}) {
  const where: Record<string, unknown> = { cancelledAt: null };
  if (opts.placementId) where.placementId = opts.placementId;
  if (opts.upcomingOnly) {
    where.completed = false;
    where.scheduledAt = { gte: new Date() };
  }

  if (actor.role === 'student') {
    where.placement = { studentId: actor.id };
  } else if (actor.role === 'academic_supervisor') {
    where.supervisorId = actor.id;
  } else if (!isStaff(actor)) {
    throw new AppError(403, 'Access denied');
  }

  return prisma.visitSchedule.findMany({
    where,
    orderBy: { scheduledAt: 'asc' },
    select: VISIT_SELECT,
  });
}

export async function createVisit(actor: Actor, input: z.infer<typeof createVisitSchema>) {
  const placement = await assertMayScheduleOn(actor, input.placementId);
  if (placement.finalizationStatus === 'finalized') {
    throw new AppError(409, 'This placement has been finalized');
  }

  const scheduledAt = new Date(input.scheduledAt);
  if (scheduledAt.getTime() < Date.now()) {
    throw new AppError(422, 'A review cannot be scheduled in the past');
  }

  // A supervisor scheduling for themselves is the common case; staff acting on
  // a placement book the assigned supervisor, not themselves.
  const supervisorId = actor.role === 'academic_supervisor'
    ? actor.id
    : placement.academicSupervisorId;
  if (!supervisorId) {
    throw new AppError(422, 'This placement has no academic supervisor assigned yet');
  }

  const visit = await prisma.visitSchedule.create({
    data: {
      placementId: input.placementId,
      supervisorId,
      scheduledAt,
      visitType: input.visitType,
      durationMinutes: input.durationMinutes,
      location: input.location ?? null,
      notes: input.notes ?? null,
      createdById: actor.id,
    },
    select: VISIT_SELECT,
  });

  // The student must find out from the system, not by being told in person.
  await createNotification({
    userId: placement.studentId,
    type: 'system',
    title: 'A review has been scheduled',
    body: `${visit.visitType.replace(/_/g, ' ')} on ${scheduledAt.toDateString()}`,
    link: '/student/dashboard',
  }).catch(() => undefined);

  return visit;
}

async function loadOwnVisit(actor: Actor, id: string) {
  const visit = await prisma.visitSchedule.findUnique({
    where: { id },
    select: { id: true, supervisorId: true, placementId: true },
  });
  if (!visit) throw new AppError(404, 'Review not found');
  if (visit.supervisorId !== actor.id && !isStaff(actor)) {
    throw new AppError(403, 'This review belongs to another supervisor');
  }
  return visit;
}

export async function updateVisit(actor: Actor, id: string, input: z.infer<typeof updateVisitSchema>) {
  await loadOwnVisit(actor, id);
  return prisma.visitSchedule.update({
    where: { id },
    data: {
      ...(input.scheduledAt !== undefined && { scheduledAt: new Date(input.scheduledAt) }),
      ...(input.visitType !== undefined && { visitType: input.visitType }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
      ...(input.location !== undefined && { location: input.location }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    select: VISIT_SELECT,
  });
}

export async function completeVisit(actor: Actor, id: string, input: z.infer<typeof completeVisitSchema>) {
  await loadOwnVisit(actor, id);
  return prisma.visitSchedule.update({
    where: { id },
    data: { completed: true, completedAt: new Date(), outcomeNote: input.outcomeNote ?? null },
    select: VISIT_SELECT,
  });
}

export async function cancelVisit(actor: Actor, id: string, input: z.infer<typeof cancelVisitSchema>) {
  await loadOwnVisit(actor, id);
  // Cancelled, never deleted: a review that vanished and one that never existed
  // must not look the same to the student it was booked with.
  return prisma.visitSchedule.update({
    where: { id },
    data: { cancelledAt: new Date(), cancelReason: input.cancelReason },
    select: VISIT_SELECT,
  });
}

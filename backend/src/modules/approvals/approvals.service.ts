import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import { listTransferRequests } from '../placements/transfers.service';
import { assertMayDecide, assertMayRequest, type Actor } from './approvals.policy';
import { applyApprovalEffect } from './approvals.effects';
import type { z } from 'zod';
import type { createApprovalSchema, decideApprovalSchema } from './approvals.schema';

const SELECT = {
  id: true, kind: true, status: true, title: true, reason: true,
  effectiveFrom: true, effectiveTo: true, requestedAt: true, decidedAt: true,
  decisionNote: true, placementId: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  placement: { select: { company: { select: { name: true } } } },
} as const;

async function loadOwnership(placementId: string) {
  const p = await prisma.placement.findUnique({
    where: { id: placementId },
    select: { id: true, studentId: true, academicSupervisorId: true, isCurrent: true, placementStatus: true },
  });
  if (!p) throw new AppError(404, 'Placement not found');
  return p;
}

export async function createApproval(actor: Actor, input: z.infer<typeof createApprovalSchema>) {
  const placement = await loadOwnership(input.placementId);
  assertMayRequest(actor, placement);

  if (!placement.isCurrent || placement.placementStatus !== 'active') {
    throw new AppError(409, 'This placement is not open for requests');
  }
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    throw new AppError(422, 'The end date is before the start date');
  }

  // One open request per kind per placement — also enforced by a partial unique
  // index, so a double-submit races into a constraint rather than two queues.
  const open = await prisma.approvalRequest.findFirst({
    where: { placementId: input.placementId, kind: input.kind, status: 'requested' },
    select: { id: true },
  });
  if (open) throw new AppError(409, 'You already have an open request of this kind');

  const request = await prisma.approvalRequest.create({
    data: {
      kind: input.kind,
      requestedById: actor.id,
      studentId: placement.studentId,
      placementId: input.placementId,
      title: input.title,
      reason: input.reason,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      payload: (input.payload ?? undefined) as never,
    },
    select: SELECT,
  });

  if (placement.academicSupervisorId) {
    await createNotification({
      userId: placement.academicSupervisorId,
      type: 'system',
      title: 'A request needs your decision',
      body: request.title,
      link: '/supervisor/dashboard',
    }).catch(() => undefined);
  }

  return request;
}

/** The pending queue: new-style requests unioned with company-transfer requests. */
export async function listPending(actor: Actor) {
  const where: Record<string, unknown> = { status: 'requested' };
  if (actor.role === 'academic_supervisor') {
    where.placement = { academicSupervisorId: actor.id };
  } else if (actor.role === 'student') {
    where.studentId = actor.id;
  } else if (!['coordinator', 'hod', 'admin'].includes(actor.role)) {
    throw new AppError(403, 'Access denied');
  }

  const requests = await prisma.approvalRequest.findMany({
    where,
    orderBy: { requestedAt: 'desc' },
    take: 20,
    select: SELECT,
  });

  const rows = requests.map((r) => ({
    id: r.id,
    source: 'approval' as const,
    kind: r.kind as string,
    title: r.title,
    student: `${r.student.firstName} ${r.student.lastName}`,
    company: r.placement.company?.name ?? null,
    requestedAt: r.requestedAt,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  }));

  // Change of COMPANY still lives in its own table — its approval creates a
  // successor placement, which a generic row cannot carry. It is folded into
  // the same queue for reading and links out to its existing decide endpoint.
  if (actor.role !== 'student') {
    try {
      const { requests: transfers } = await listTransferRequests({ status: 'requested', limit: 20 });
      for (const t of transfers) {
        rows.push({
          id: t.id,
          source: 'transfer' as unknown as 'approval',
          kind: 'company_transfer',
          title: `Change of attachment — ${t.newCompanyName ?? 'new company'}`,
          student: `${t.student.firstName} ${t.student.lastName}`,
          company: t.newCompanyName ?? null,
          requestedAt: t.requestedAt,
          effectiveFrom: null,
          effectiveTo: null,
        });
      }
    } catch {
      // The transfer queue is a nice-to-have here; its own screen is the
      // authority. A failure there must not blank the approvals panel.
    }
  }

  rows.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  return rows;
}

export async function decideApproval(actor: Actor, id: string, input: z.infer<typeof decideApprovalSchema>) {
  const existing = await prisma.approvalRequest.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Request not found');
  if (existing.status !== 'requested') throw new AppError(409, 'This request has already been decided');

  const placement = await loadOwnership(existing.placementId);
  assertMayDecide(actor, existing.kind, placement);

  // A supervisor must never be able to decide their own replacement.
  if (existing.kind === 'supervisor_change' && actor.id === placement.academicSupervisorId) {
    throw new AppError(403, 'You cannot decide a request to replace yourself');
  }

  const decided = await prisma.$transaction(async (tx) => {
    const updated = await tx.approvalRequest.update({
      where: { id },
      data: {
        status: input.decision,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
        ...(input.decision === 'approved' && { effectAppliedAt: new Date() }),
      },
    });

    // Guarded by effectAppliedAt above, so a retry cannot apply it twice.
    if (input.decision === 'approved' && !existing.effectAppliedAt) {
      await applyApprovalEffect(tx, updated);
    }

    return tx.approvalRequest.findUniqueOrThrow({ where: { id }, select: SELECT });
  });

  await createNotification({
    userId: existing.studentId,
    type: input.decision === 'approved' ? 'placement_approved' : 'placement_rejected',
    title: `Your request was ${input.decision}`,
    body: decided.title,
    link: '/student/dashboard',
  }).catch(() => undefined);

  return decided;
}

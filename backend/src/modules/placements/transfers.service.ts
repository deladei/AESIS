import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { encryptPII } from '../../shared/utils/crypto';
import { pickLeastLoadedSupervisor } from './placements.service';
import type { CreateTransferRequestInput, DecideTransferRequestInput } from './placements.schema';

// Change of attachment. The logbook rule: a student starts and finishes at one
// establishment; a change needs the university's written permission IN ADVANCE
// (the authorization letter), else the attachment is cancelled. An approved
// transfer closes the old placement as transferred_out (its weeks still count
// toward the minimum) and opens a successor placement — the attachment is
// continuous, so week numbering never resets.

const REQUEST_INCLUDE = {
  student:       { select: { id: true, firstName: true, lastName: true, email: true, indexNumber: true } },
  fromPlacement: { select: { id: true, placementStatus: true, region: true, endDate: true, company: { select: { id: true, name: true } } } },
  toPlacement:   { select: { id: true, placementStatus: true, company: { select: { id: true, name: true } } } },
  decidedBy:     { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PlacementTransferRequestInclude;

// ── Student: request a transfer ───────────────────────────────

export async function createTransferRequest(
  studentId: string,
  placementId: string,
  input: CreateTransferRequestInput,
) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');
  if (placement.studentId !== studentId) throw new AppError(403, 'Access denied');
  if (!placement.isCurrent || placement.placementStatus !== 'active') {
    throw new AppError(409, 'Transfers apply only to your current active placement');
  }

  try {
    return await prisma.placementTransferRequest.create({
      data: {
        studentId,
        fromPlacementId:        placementId,
        newCompanyName:         input.newCompanyName,
        newCompanyAddress:      input.newCompanyAddress,
        reason:                 input.reason,
        authorizationLetterUrl: input.authorizationLetterUrl,
      },
      include: REQUEST_INCLUDE,
    });
  } catch (err) {
    // Partial unique index: one OPEN request per placement.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'This placement already has a pending transfer request');
    }
    throw err;
  }
}

export async function getMyTransferRequests(studentId: string) {
  return prisma.placementTransferRequest.findMany({
    where:   { studentId },
    include: REQUEST_INCLUDE,
    orderBy: { requestedAt: 'desc' },
  });
}

// ── Staff: list / decide ──────────────────────────────────────

export async function listTransferRequests(filters: {
  status?: 'requested' | 'approved' | 'rejected';
  page?: number;
  limit?: number;
}) {
  const { status, page = 1, limit = 20 } = filters;
  const { skip, take } = paginate(page, limit);
  const where: Prisma.PlacementTransferRequestWhereInput = status ? { status } : {};

  const [requests, total] = await Promise.all([
    prisma.placementTransferRequest.findMany({
      where,
      skip,
      take,
      include: REQUEST_INCLUDE,
      orderBy: { requestedAt: 'desc' },
    }),
    prisma.placementTransferRequest.count({ where }),
  ]);

  return { requests, meta: buildMeta(total, page, limit) };
}

export async function decideTransferRequest(
  requestId: string,
  deciderId: string,
  input: DecideTransferRequestInput,
) {
  const request = await prisma.placementTransferRequest.findUnique({
    where:   { id: requestId },
    include: { fromPlacement: true },
  });
  if (!request) throw new AppError(404, 'Transfer request not found');
  if (request.status !== 'requested') {
    throw new AppError(409, 'This transfer request has already been decided');
  }

  if (input.decision === 'rejected') {
    const updated = await prisma.placementTransferRequest.update({
      where: { id: requestId },
      data:  {
        status:       'rejected',
        decidedById:  deciderId,
        decidedAt:    new Date(),
        decisionNote: input.decisionNote,
      },
      include: REQUEST_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        userId:     deciderId,
        action:     'placement_status_change',
        entityType: 'placement_transfer_request',
        entityId:   requestId,
        metadata:   { change: 'transfer_rejected', note: input.decisionNote ?? null },
      },
    });

    return updated;
  }

  // Approval IS the university's written permission — the authorization letter
  // is its artifact and must exist (supplied by the student up front or by the
  // coordinator at decision time) before the transfer can be authorized.
  const letterUrl = input.authorizationLetterUrl ?? request.authorizationLetterUrl;
  if (!letterUrl) {
    throw new AppError(409, 'An authorization letter is required to approve a transfer');
  }

  const from = request.fromPlacement;
  if (!from.isCurrent || from.placementStatus !== 'active') {
    throw new AppError(409, 'The placement under transfer is no longer active');
  }

  // The successor may sit in a new region (the coordinator reads it off the new
  // address); supervisor allocation re-derives from that region, falling back
  // to continuity with the old supervisor.
  const region = input.newRegion ?? from.region;
  const academicSupervisorId =
    input.supervisorId
    ?? (region ? await pickLeastLoadedSupervisor(region) : null)
    ?? from.academicSupervisorId
    ?? null;

  const decided = await prisma.$transaction(async (tx) => {
    // Company find-or-create, same pattern as createPlacement.
    let company = await tx.company.findFirst({ where: { name: request.newCompanyName } });
    if (company) {
      company = await tx.company.update({
        where: { id: company.id },
        data:  { address: encryptPII(request.newCompanyAddress) },
      });
    } else {
      company = await tx.company.create({
        data: { name: request.newCompanyName, address: encryptPII(request.newCompanyAddress) },
      });
    }

    // Close the old placement. Its weeks still count toward the minimum.
    await tx.placement.update({
      where: { id: from.id },
      data:  { placementStatus: 'transferred_out', isCurrent: false },
    });

    // Open the successor: the attachment is continuous, so it runs from the
    // approval date to the original end date. No company supervisor is carried
    // over — the new establishment's industry supervisors arrive as records.
    const successor = await tx.placement.create({
      data: {
        studentId:             request.studentId,
        companyId:             company.id,
        academicYearId:        from.academicYearId,
        region,
        academicSupervisorId,
        startDate:             new Date(),
        endDate:               from.endDate,
        placementStatus:       'active',
        isCurrent:             true,
        supersedesPlacementId: from.id,
        approvedBy:            deciderId,
        approvedAt:            new Date(),
      },
    });

    const updated = await tx.placementTransferRequest.update({
      where: { id: requestId },
      data:  {
        status:                 'approved',
        toPlacementId:          successor.id,
        decidedById:            deciderId,
        decidedAt:              new Date(),
        decisionNote:           input.decisionNote,
        authorizationLetterUrl: letterUrl,
      },
      include: REQUEST_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        userId:     deciderId,
        action:     'placement_status_change',
        entityType: 'placement',
        entityId:   from.id,
        metadata:   {
          change:          'transfer_approved',
          requestId,
          from:            'active',
          to:              'transferred_out',
          toPlacementId:   successor.id,
          authorizationLetterUrl: letterUrl,
        },
      },
    });

    return updated;
  });

  return decided;
}

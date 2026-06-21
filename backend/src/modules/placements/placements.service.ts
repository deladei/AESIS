import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { encryptPII } from '../../shared/utils/crypto';
import type {
  CreatePlacementInput,
  UpdatePlacementStatusInput,
  AssignSupervisorInput,
  CreateCompanyInput,
} from './placements.schema';

// ── Helpers ───────────────────────────────────────────────────

function getActiveAcademicYear() {
  return prisma.academicYear.findFirst({ where: { isActive: true } });
}

// ── Placement CRUD ────────────────────────────────────────────

export async function createPlacement(studentId: string, input: CreatePlacementInput) {
  const {
    companyName, companyAddress, companySupervisorName,
    companySupervisorEmail, region, startDate, endDate,
  } = input;

  // Student must not already have an active/pending placement
  const existing = await prisma.placement.findFirst({
    where: {
      studentId,
      placementStatus: { in: ['pending', 'active'] },
    },
  });
  if (existing) {
    throw new AppError(409, 'You already have an active or pending placement application');
  }

  const academicYear = await getActiveAcademicYear();
  if (!academicYear) throw new AppError(503, 'No active academic year configured');

  // Find or create company by name
  let company = await prisma.company.findFirst({ where: { name: companyName } });
  if (company) {
    company = await prisma.company.update({
      where: { id: company.id },
      data:  { address: encryptPII(companyAddress) },
    });
  } else {
    company = await prisma.company.create({
      data: { name: companyName, address: encryptPII(companyAddress) },
    });
  }

  // Find or create company supervisor account (unverified placeholder)
  let companySupervisor = await prisma.user.findUnique({
    where: { email: companySupervisorEmail },
  });

  if (!companySupervisor) {
    // Get CS dept for FK requirement
    const dept = await prisma.department.findUnique({ where: { code: 'CS' } });
    if (!dept) throw new AppError(503, 'CS department not configured');

    companySupervisor = await prisma.user.create({
      data: {
        email:        companySupervisorEmail,
        passwordHash: '', // company supervisors don't log in directly
        role:         'company_supervisor',
        firstName:    companySupervisorName.split(' ')[0] ?? companySupervisorName,
        lastName:     companySupervisorName.split(' ').slice(1).join(' ') || '-',
        departmentId: dept.id,
        isVerified:   false,
      },
    });
  }

  const placement = await prisma.placement.create({
    data: {
      studentId,
      companySupervisorId: companySupervisor.id,
      companyId:           company.id,
      academicYearId:      academicYear.id,
      region,
      startDate:           new Date(startDate),
      endDate:             new Date(endDate),
      placementStatus:     'pending',
    },
    include: {
      company:           { select: { id: true, name: true } },
      companySupervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // Auto-assign the least-loaded academic supervisor covering this region.
  // If none is configured yet the placement stays unassigned + pending and the
  // coordinator picks it up from the "needs supervisor" queue.
  const supervisorId = await pickLeastLoadedSupervisor(region);
  if (supervisorId) {
    const assigned = await prisma.placement.update({
      where: { id: placement.id },
      data:  { academicSupervisorId: supervisorId, placementStatus: 'active' },
      include: {
        company:            { select: { id: true, name: true } },
        companySupervisor:  { select: { id: true, firstName: true, lastName: true, email: true } },
        academicSupervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    await prisma.auditLog.create({
      data: {
        userId:     supervisorId,
        action:     'placement_status_change',
        entityType: 'placement',
        entityId:   placement.id,
        metadata:   { change: 'supervisor_auto_assigned', region, toSupervisorId: supervisorId },
      },
    });
    return assigned;
  }

  return placement;
}

/**
 * Pick the academic supervisor for `region` carrying the fewest live placements
 * (pending + active), so a region with two or more supervisors balances load
 * instead of piling every intern on one person. Ties break by supervisor id
 * (stable). Returns null when no supervisor is assigned to the region yet.
 */
export async function pickLeastLoadedSupervisor(region: string): Promise<string | null> {
  const supervisors = await prisma.user.findMany({
    where:  { role: 'academic_supervisor', supervisedRegion: region as never },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (supervisors.length === 0) return null;
  if (supervisors.length === 1) return supervisors[0].id;

  const ids = supervisors.map((s) => s.id);
  const loads = await prisma.placement.groupBy({
    by:    ['academicSupervisorId'],
    where: { academicSupervisorId: { in: ids }, placementStatus: { in: ['pending', 'active'] } },
    _count: { _all: true },
  });
  const loadById = new Map(loads.map((l) => [l.academicSupervisorId, l._count._all]));

  let bestId = ids[0];
  let bestLoad = loadById.get(ids[0]) ?? 0;
  for (const id of ids) {
    const load = loadById.get(id) ?? 0;
    if (load < bestLoad) { bestId = id; bestLoad = load; }
  }
  return bestId;
}

export async function getPlacement(placementId: string, requesterId: string, requesterRole: string) {
  const placement = await prisma.placement.findUnique({
    where:   { id: placementId },
    include: {
      student:           { select: { id: true, firstName: true, lastName: true, email: true } },
      academicSupervisor:{ select: { id: true, firstName: true, lastName: true, email: true } },
      companySupervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
      company:           true,
      academicYear:      { select: { id: true, label: true } },
      documents:         true,
    },
  });

  if (!placement) throw new AppError(404, 'Placement not found');

  // Resource-level access: students see only their own; supervisors see assigned; coordinator/admin see all
  if (requesterRole === 'student' && placement.studentId !== requesterId) {
    throw new AppError(403, 'Access denied');
  }
  if (requesterRole === 'academic_supervisor' && placement.academicSupervisorId !== requesterId) {
    throw new AppError(403, 'Access denied');
  }

  return placement;
}

export async function getMyPlacements(studentId: string) {
  return prisma.placement.findMany({
    where:   { studentId },
    include: {
      company:      { select: { id: true, name: true } },
      academicYear: { select: { label: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Coordinator: approve / reject ─────────────────────────────

export async function updatePlacementStatus(
  placementId: string,
  coordinatorId: string,
  input: UpdatePlacementStatusInput,
) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');

  if (placement.placementStatus === 'active' && input.status === 'active') {
    throw new AppError(409, 'Placement is already active');
  }

  const updateData: Record<string, unknown> = {
    placementStatus: input.status,
    approvedBy:      coordinatorId,
  };

  if (input.status === 'active') {
    updateData['approvedAt']           = new Date();
    updateData['academicSupervisorId'] = input.supervisorId ?? null;
  }

  if (input.status === 'rejected') {
    updateData['rejectionReason'] = input.rejectionReason;
  }

  const updated = await prisma.placement.update({
    where: { id: placementId },
    data:  updateData,
    include: {
      student: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  // No logbook rows are pre-generated on approval. A student's weekly entries
  // are created only when they actually start logging (the entries pipeline),
  // so a new placement begins with a clean, empty slate — data appears as the
  // student does the work, never before.

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId:     coordinatorId,
      action:     'placement_status_change',
      entityType: 'placement',
      entityId:   placementId,
      metadata:   {
        from:   placement.placementStatus,
        to:     input.status,
        reason: input.rejectionReason ?? null,
      },
    },
  });

  return updated;
}

// ── Coordinator: assign / reassign a supervisor ──────────────
// Handles both supervisor slots. `kind` selects which: 'academic' →
// academicSupervisorId (faculty oversight), 'company' → companySupervisorId
// (the host-org supervisor). Each slot validates that the user actually holds
// the matching role, then records an append-only audit row capturing the slot
// and the from/to ids.

export async function assignSupervisor(
  placementId: string,
  coordinatorId: string,
  input: AssignSupervisorInput,
) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');

  const supervisor = await prisma.user.findUnique({ where: { id: input.supervisorId } });

  const slot =
    input.kind === 'company'
      ? {
          requiredRole: 'company_supervisor' as const,
          column:       'companySupervisorId' as const,
          currentId:    placement.companySupervisorId,
          rejectMsg:    'Selected user is not a company supervisor',
        }
      : {
          requiredRole: 'academic_supervisor' as const,
          column:       'academicSupervisorId' as const,
          currentId:    placement.academicSupervisorId,
          rejectMsg:    'Selected user is not an academic supervisor',
        };

  if (!supervisor || supervisor.role !== slot.requiredRole) {
    throw new AppError(400, slot.rejectMsg);
  }

  // Assigning the academic supervisor to a still-pending placement activates it
  // (the region-auto-assign path couldn't find a supervisor at registration).
  const activates = slot.column === 'academicSupervisorId' && placement.placementStatus === 'pending';

  const updated = await prisma.placement.update({
    where: { id: placementId },
    data:  { [slot.column]: input.supervisorId, ...(activates ? { placementStatus: 'active' } : {}) },
    include: {
      student:            { select: { id: true, firstName: true, lastName: true, email: true } },
      academicSupervisor: { select: { id: true, firstName: true, lastName: true } },
      companySupervisor:  { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId:     coordinatorId,
      action:     'placement_status_change',
      entityType: 'placement',
      entityId:   placementId,
      metadata:   {
        change:           'supervisor_assigned',
        kind:             input.kind,
        fromSupervisorId: slot.currentId ?? null,
        toSupervisorId:   input.supervisorId,
      },
    },
  });

  return updated;
}

// ── Coordinator: list all placements ─────────────────────────

export async function listPlacements(filters: {
  status?: string;
  academicYearId?: string;
  page?: number;
  limit?: number;
}) {
  const { status, academicYearId, page = 1, limit = 20 } = filters;
  const { skip, take } = paginate(page, limit);

  const where: Record<string, unknown> = {};
  if (status) where['placementStatus'] = status;
  if (academicYearId) where['academicYearId'] = academicYearId;

  const [placements, total] = await Promise.all([
    prisma.placement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        student:           { select: { id: true, firstName: true, lastName: true, email: true } },
        company:           { select: { id: true, name: true } },
        academicSupervisor:{ select: { id: true, firstName: true, lastName: true } },
        academicYear:      { select: { label: true } },
      },
    }),
    prisma.placement.count({ where }),
  ]);

  return { placements, meta: buildMeta(total, page, limit) };
}

// ── Supervisor: list assigned placements ──────────────────────

export async function getSupervisorPlacements(supervisorId: string) {
  return prisma.placement.findMany({
    where:   { academicSupervisorId: supervisorId, placementStatus: 'active' },
    include: {
      student: { select: { id: true, firstName: true, lastName: true, email: true, programmeId: true } },
      company: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Company CRUD ──────────────────────────────────────────────

export async function createCompany(input: CreateCompanyInput) {
  const existing = await prisma.company.findFirst({ where: { name: input.name } });
  if (existing) throw new AppError(409, `Company "${input.name}" already exists`);

  return prisma.company.create({
    data: {
      name:     input.name,
      address:  input.address ? encryptPII(input.address) : undefined,
      industry: input.industry,
      website:  input.website || undefined,
    },
  });
}

export async function listCompanies(page = 1, limit = 20) {
  const { skip, take } = paginate(page, limit);

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip,
      take,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { placements: true } },
      },
    }),
    prisma.company.count(),
  ]);

  return { companies, meta: buildMeta(total, page, limit) };
}

export async function getCompanyAnalytics(companyId: string) {
  const company = await prisma.company.findUnique({
    where:   { id: companyId },
    include: {
      placements: {
        where: { placementStatus: { in: ['active', 'completed'] } },
        include: {
          logbookSubmissions: {
            include: { analysis: { select: { qualityScore: true } } },
          },
          _count: { select: { logbookSubmissions: true } },
        },
      },
    },
  });

  if (!company) throw new AppError(404, 'Company not found');

  // Aggregate quality scores across all submissions for this company
  const allScores: number[] = [];
  for (const placement of company.placements) {
    for (const submission of placement.logbookSubmissions) {
      if (submission.analysis?.qualityScore) {
        allScores.push(Number(submission.analysis.qualityScore));
      }
    }
  }

  const avgQuality = allScores.length
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : null;

  return {
    company:      { id: company.id, name: company.name, industry: company.industry },
    totalStudents: company.placements.length,
    avgQualityScore: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
    totalSubmissions: company.placements.reduce(
      (sum, p) => sum + p._count.logbookSubmissions,
      0,
    ),
  };
}

// ── Document upload ───────────────────────────────────────────

export async function addPlacementDocument(
  placementId: string,
  requesterId: string,
  file: { url: string; name: string; size: number; mimeType: string },
  docType: string,
) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');
  if (placement.studentId !== requesterId) throw new AppError(403, 'Access denied');

  return prisma.placementDocument.create({
    data: {
      placementId,
      docType,
      fileUrl:  file.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
    },
  });
}

export async function getPlacementDocuments(placementId: string, requesterId: string, requesterRole: string) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');

  if (requesterRole === 'student' && placement.studentId !== requesterId) {
    throw new AppError(403, 'Access denied');
  }

  return prisma.placementDocument.findMany({
    where:   { placementId },
    orderBy: { uploadedAt: 'desc' },
  });
}

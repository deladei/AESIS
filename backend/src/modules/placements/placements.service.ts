import { Prisma, type PlacementStatus, type Region } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { encryptPII } from '../../shared/utils/crypto';
import { meanQualityScore, mergedQualityScores } from '../../shared/utils/quality';
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

  // A new placement is ALWAYS created pending — a coordinator must approve it
  // before it goes active and the student can use their logbook. Region drives
  // the supervisor auto-balance, but that happens at approval time
  // (updatePlacementStatus), never here, so registration can never skip the
  // approval gate.
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
    // Only a live (pending/active) placement is "current" — the partial unique
    // index allows one per student. Closing statuses clear the flag; re-approval
    // restores it (a second live placement then fails the index → 409 below).
    isCurrent:       input.status === 'active',
  };

  if (input.status === 'active') {
    updateData['approvedAt'] = new Date();
    // Coordinator may pick a supervisor explicitly; otherwise fall back to the
    // least-loaded supervisor covering the placement's region (S49 balancing,
    // applied at approval). Keep any already-assigned supervisor if neither
    // yields one, so approval never silently un-assigns.
    const chosen =
      input.supervisorId
      ?? (placement.region ? await pickLeastLoadedSupervisor(placement.region) : null)
      ?? placement.academicSupervisorId
      ?? null;
    updateData['academicSupervisorId'] = chosen;
  }

  if (input.status === 'rejected' || input.status === 'cancelled') {
    updateData['rejectionReason'] = input.rejectionReason;
  }

  let updated;
  try {
    updated = await prisma.placement.update({
      where: { id: placementId },
      data:  updateData,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'Student already has a current placement');
    }
    throw err;
  }

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

  // Assigning the academic supervisor to a still-pending placement also approves
  // and activates it — this is the coordinator picking a placement straight off
  // the "needs a supervisor" queue, which counts as the approval.
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
  q?: string;
  page?: number;
  limit?: number;
}) {
  const { status, academicYearId, q, page = 1, limit = 20 } = filters;
  const { skip, take } = paginate(page, limit);

  const where: Record<string, unknown> = {};
  if (status) where['placementStatus'] = status;
  if (academicYearId) where['academicYearId'] = academicYearId;
  if (q && q.trim()) {
    const term = q.trim();
    where['OR'] = [
      { student: { firstName:   { contains: term, mode: 'insensitive' } } },
      { student: { lastName:    { contains: term, mode: 'insensitive' } } },
      { student: { email:       { contains: term, mode: 'insensitive' } } },
      { student: { indexNumber: { contains: term, mode: 'insensitive' } } },
      { company: { name:        { contains: term, mode: 'insensitive' } } },
    ];
  }

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

/** Placement states that mean the company is currently hosting someone. */
const HOSTING_STATUSES: PlacementStatus[] = ['active'];

/**
 * Host companies roster. Each row carries what the coordinator's company board
 * actually shows: how many interns the company has hosted in total, how many it
 * is hosting right now, how many roles it has open, and where its placements
 * are. Every figure is counted off real rows — a company with no placements
 * reads zero rather than borrowing a number from anywhere else.
 *
 * `region` is the region MOST of this company's placements sit in. The company
 * table has no location column (its address is encrypted at the app layer and
 * is a postal address, not a region), so the placements are the only truthful
 * source for "where is this company".
 */
export async function listCompanies(page = 1, limit = 20) {
  const { skip, take } = paginate(page, limit);

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip,
      take,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { placements: true } },
        placements: {
          select: { studentId: true, placementStatus: true, region: true },
        },
        opportunities: {
          where:  { status: 'published' },
          select: { id: true },
        },
      },
    }),
    prisma.company.count(),
  ]);

  const rows = companies.map((c) => {
    const active = c.placements.filter(p => HOSTING_STATUSES.includes(p.placementStatus));

    // Most common region across this company's placements; null when none of
    // them carry one, in which case the UI shows nothing rather than a guess.
    const regionCounts = new Map<Region, number>();
    for (const p of c.placements) {
      if (p.region) regionCounts.set(p.region, (regionCounts.get(p.region) ?? 0) + 1);
    }
    const region = [...regionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      // An explicit field list, not a spread of the row: `address` and
      // `contactPhone` are AES-256-GCM ciphertext at rest and have no business
      // reaching a browser, and a spread would ship them the moment a column
      // is added.
      id:          c.id,
      name:        c.name,
      industry:    c.industry,
      website:     c.website,
      description: c.description,
      logoUrl:     c.logoUrl,
      isPartner:   c.isPartner,
      createdAt:   c.createdAt,
      _count:      c._count,
      region,
      // Distinct students, so a transferred student who returns is one intern.
      internCount:        new Set(c.placements.map(p => p.studentId)).size,
      activePlacements:   active.length,
      openOpportunities:  c.opportunities.length,
      // "Active" means it is hosting someone today. Everything else is
      // "Pending" — a partner on the books with nobody placed yet.
      status:             active.length > 0 ? ('active' as const) : ('pending' as const),
    };
  });

  return { companies: rows, meta: buildMeta(total, page, limit) };
}

/**
 * Cohort-wide company figures for the board's headline strip, plus the partner
 * leaderboard. Ranking is by real placement count — never hand-ordered, and
 * never by a rating, because nothing in this system rates a company.
 */
export async function getCompaniesOverview() {
  const [totalCompanies, activePlacements, openOpportunities, internRows, top] = await Promise.all([
    prisma.company.count(),
    prisma.placement.count({ where: { placementStatus: 'active' } }),
    prisma.internshipOpportunity.count({ where: { status: 'published' } }),
    prisma.placement.findMany({
      where:  { companyId: { not: null } },
      select: { studentId: true },
      distinct: ['studentId'],
    }),
    prisma.company.findMany({
      orderBy: { placements: { _count: 'desc' } },
      take:    3,
      select:  {
        id: true, name: true, industry: true, logoUrl: true,
        _count: { select: { placements: true } },
      },
    }),
  ]);

  return {
    totalCompanies,
    activePlacements,
    openOpportunities,
    placedInterns: internRows.length,
    // Only companies that have actually hosted someone can lead a leaderboard.
    topCompanies:  top
      .filter(c => c._count.placements > 0)
      .map(c => ({
        id: c.id, name: c.name, industry: c.industry, logoUrl: c.logoUrl,
        placements: c._count.placements,
      })),
  };
}

/**
 * One company's aggregate performance.
 *
 * Reads the CONSOLIDATED logbook (`logbook_entry` + its AI assessments). It used
 * to read `logbook_submissions` alone — the legacy table the writer no longer
 * fills — so every company on the current pipeline reported zero submissions and
 * a null quality score no matter how many weeks its interns had submitted. The
 * legacy analyses are still merged in, because for older cohorts they are the
 * only scores that exist, but they are no longer the only source.
 */
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
          logbookEntries: {
            select: {
              submittedAt: true,
              assessments: {
                orderBy: { createdAt: 'desc' },
                take:    1,
                select:  { quality: true },
              },
            },
          },
        },
      },
    },
  });

  if (!company) throw new AppError(404, 'Company not found');

  const scores = company.placements.flatMap(p => mergedQualityScores(
    p.logbookSubmissions.map(sub => sub.analysis?.qualityScore),
    p.logbookEntries,
  ));

  // A submission is a week the student actually sent, on either pipeline.
  const totalSubmissions = company.placements.reduce(
    (sum, p) => sum + p.logbookSubmissions.length
      + p.logbookEntries.filter(e => e.submittedAt != null).length,
    0,
  );

  return {
    company:      { id: company.id, name: company.name, industry: company.industry },
    totalStudents: company.placements.length,
    avgQualityScore: meanQualityScore(scores),
    totalSubmissions,
  };
}

/**
 * Company roster — every intern placed at one company (coordinator/admin).
 * Backs the coordinator company detail page.
 */
export async function getCompanyInterns(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, industry: true, website: true },
  });
  if (!company) throw new AppError(404, 'Company not found');

  const placements = await prisma.placement.findMany({
    where: { companyId },
    orderBy: [{ placementStatus: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      placementStatus: true,
      startDate: true,
      endDate: true,
      student:            { select: { id: true, firstName: true, lastName: true, email: true, indexNumber: true } },
      academicSupervisor: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return { company, placements };
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

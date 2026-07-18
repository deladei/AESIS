import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { assertPlacementAccess, type Actor, type PlacementOwnership } from '../entries/entries.policy';
import type {
  CreateIndustrySupervisorInput,
  UpdateIndustrySupervisorInput,
  VerifySupervisorInput,
  VisitConfirmInput,
} from './industry.schema';

// Industry supervisors are records, not users. The student supplies the
// contact details; verification (worth trusting a 30-mark channel) is a staff /
// visiting-supervisor decision and NEVER writable through the student paths.

const OWNERSHIP_SELECT = {
  id: true,
  studentId: true,
  academicSupervisorId: true,
  companySupervisorId: true,
};

const isStaff = (a: Actor) => a.role === 'admin' || a.role === 'coordinator' || a.role === 'hod';

async function loadPlacement(placementId: string): Promise<PlacementOwnership> {
  const p = await prisma.placement.findUnique({ where: { id: placementId }, select: OWNERSHIP_SELECT });
  if (!p) throw new AppError(404, 'Placement not found');
  return p;
}

async function loadSupervisor(id: string) {
  const s = await prisma.industrySupervisor.findUnique({
    where: { id },
    include: { placement: { select: OWNERSHIP_SELECT } },
  });
  if (!s) throw new AppError(404, 'Industry supervisor not found');
  return s;
}

/**
 * Classify an email's domain against the webmail_domain lookup. A webmail
 * address is a FLAG for coordinator attention, never a rejection — many
 * legitimate Ghanaian SMEs run on Gmail.
 */
export async function classifyEmailDomain(email: string | null | undefined): Promise<'company' | 'webmail' | 'none'> {
  if (!email) return 'none';
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'none';
  const hit = await prisma.webmailDomain.findUnique({ where: { domain } });
  return hit ? 'webmail' : 'company';
}

/** The student (own placement) or staff may add a supervisor record. */
function assertCanAuthorRecord(actor: Actor, p: PlacementOwnership): void {
  if (isStaff(actor)) return;
  if (actor.role === 'student' && p.studentId === actor.id) return;
  throw new AppError(403, 'Not permitted to manage industry supervisors for this placement');
}

export async function createSupervisor(actor: Actor, placementId: string, input: CreateIndustrySupervisorInput) {
  const placement = await loadPlacement(placementId);
  assertCanAuthorRecord(actor, placement);

  return prisma.industrySupervisor.create({
    data: {
      placementId,
      name: input.name,
      designation: input.designation ?? null,
      departmentUnit: input.departmentUnit ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      emailDomainType: await classifyEmailDomain(input.email),
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      // verification_status always starts unverified; no caller input reaches it.
    },
  });
}

export async function listSupervisors(actor: Actor, placementId: string) {
  const placement = await loadPlacement(placementId);
  assertPlacementAccess(actor, placement, 'read');
  return prisma.industrySupervisor.findMany({
    where: { placementId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Contact-detail edits. The student may fix their own placement's record only
 * while it is still unverified — editing a verified record would silently
 * redirect a trusted 30-mark channel, so any edit resets verification.
 */
export async function updateSupervisor(actor: Actor, id: string, input: UpdateIndustrySupervisorInput) {
  const existing = await loadSupervisor(id);
  assertCanAuthorRecord(actor, existing.placement);

  if (!isStaff(actor) && existing.verificationStatus !== 'unverified') {
    throw new AppError(409, 'This supervisor has been verified; ask the coordinator to change their details');
  }

  const emailChanged = input.email !== undefined && input.email !== existing.email;
  const identityChanged =
    emailChanged ||
    (input.name !== undefined && input.name !== existing.name) ||
    (input.phone !== undefined && input.phone !== existing.phone);

  return prisma.industrySupervisor.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.designation !== undefined && { designation: input.designation }),
      ...(input.departmentUnit !== undefined && { departmentUnit: input.departmentUnit }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(emailChanged && { emailDomainType: await classifyEmailDomain(input.email) }),
      ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
      ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
      // Contact identity changed after a staff verification → verification no
      // longer attests to this record; drop back to unverified.
      ...(identityChanged &&
        existing.verificationStatus !== 'unverified' && {
          verificationStatus: 'unverified' as const,
          verifiedById: null,
          verifiedAt: null,
          verificationNote: null,
        }),
    },
  });
}

/** Coordinator / HoD / admin decision: approved or rejected. */
export async function verifySupervisor(actor: Actor, id: string, input: VerifySupervisorInput) {
  if (!isStaff(actor)) {
    throw new AppError(403, 'Only the coordinator may verify an industry supervisor');
  }
  await loadSupervisor(id);

  return prisma.industrySupervisor.update({
    where: { id },
    data: {
      verificationStatus: input.status,
      verifiedById: actor.id,
      verifiedAt: new Date(),
      verificationNote: input.note ?? null,
    },
  });
}

/**
 * The assigned academic supervisor confirming identity IN PERSON during a site
 * visit — the strongest available check; the visit already exists in the
 * process, so it is reused.
 */
export async function visitConfirmSupervisor(actor: Actor, id: string, input: VisitConfirmInput) {
  const existing = await loadSupervisor(id);

  const isAssigned =
    actor.role === 'academic_supervisor' && existing.placement.academicSupervisorId === actor.id;
  if (!isAssigned && actor.role !== 'admin') {
    throw new AppError(403, 'Only the assigned academic supervisor may visit-confirm this record');
  }

  return prisma.industrySupervisor.update({
    where: { id },
    data: {
      verificationStatus: 'visit_confirmed',
      verifiedById: actor.id,
      verifiedAt: new Date(),
      verificationNote: input.note ?? null,
    },
  });
}

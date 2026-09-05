import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import { assertTransition } from './applications.stateMachine';
import type { z } from 'zod';
import type { createOpportunitySchema, applySchema, decideApplicationSchema } from './opportunities.schema';
import type { Region } from '@prisma/client';

export interface Actor { id: string; role: string }

const OPP_SELECT = {
  id: true, title: true, description: true, responsibilities: true, requiredSkills: true,
  region: true, location: true, slots: true, minAcademicLevel: true,
  opensAt: true, closesAt: true, status: true, publishedAt: true, createdAt: true,
  company: { select: { id: true, name: true, logoUrl: true, industry: true } },
  _count: { select: { applications: true } },
} as const;

const APP_SELECT = {
  id: true, status: true, statement: true, submittedAt: true, statusChangedAt: true,
  decisionNote: true,
  student: { select: { id: true, firstName: true, lastName: true, email: true, academicLevel: true } },
  opportunity: {
    select: { id: true, title: true, company: { select: { name: true, logoUrl: true } } },
  },
} as const;

const isStaff = (a: Actor) => ['coordinator', 'hod', 'admin'].includes(a.role);

// ── Opportunities ────────────────────────────────────────────

export async function listOpportunities(actor: Actor, opts: { status?: string } = {}) {
  // Students only ever see what is actually open to them; drafts are staff-only.
  const where = actor.role === 'student'
    ? { status: 'published' as const }
    : (opts.status ? { status: opts.status as never } : {});

  const opportunities = await prisma.internshipOpportunity.findMany({
    where,
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: OPP_SELECT,
  });

  // So the student's list can say "applied" without a second round trip.
  if (actor.role !== 'student') return opportunities.map((o) => ({ ...o, myApplication: null }));

  const mine = await prisma.opportunityApplication.findMany({
    where: { studentId: actor.id },
    select: { opportunityId: true, status: true },
  });
  const byOpp = new Map(mine.map((m) => [m.opportunityId, m.status]));
  return opportunities.map((o) => ({ ...o, myApplication: byOpp.get(o.id) ?? null }));
}

export async function createOpportunity(actor: Actor, input: z.infer<typeof createOpportunitySchema>) {
  if (input.opensAt && input.closesAt && new Date(input.closesAt) <= new Date(input.opensAt)) {
    throw new AppError(422, 'The closing date is not after the opening date');
  }
  return prisma.internshipOpportunity.create({
    data: {
      companyId: input.companyId,
      academicYearId: input.academicYearId,
      postedById: actor.id,
      title: input.title,
      description: input.description,
      responsibilities: input.responsibilities ?? null,
      requiredSkills: input.requiredSkills,
      region: (input.region as Region | undefined) ?? null,
      location: input.location ?? null,
      slots: input.slots,
      minAcademicLevel: input.minAcademicLevel ?? null,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    },
    select: OPP_SELECT,
  });
}

/** Publishing is its own step so a half-written posting never fans out. */
export async function publishOpportunity(actor: Actor, id: string) {
  const opp = await prisma.internshipOpportunity.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!opp) throw new AppError(404, 'Opportunity not found');
  if (opp.status !== 'draft') throw new AppError(409, 'This opportunity has already been published');

  return prisma.internshipOpportunity.update({
    where: { id },
    data: { status: 'published', publishedAt: new Date() },
    select: OPP_SELECT,
  });
}

// ── Applications ─────────────────────────────────────────────

export async function apply(actor: Actor, opportunityId: string, input: z.infer<typeof applySchema>) {
  if (actor.role !== 'student') throw new AppError(403, 'Only a student can apply');

  const opp = await prisma.internshipOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, status: true, closesAt: true, opensAt: true, minAcademicLevel: true },
  });
  if (!opp) throw new AppError(404, 'Opportunity not found');
  if (opp.status !== 'published') throw new AppError(409, 'This opportunity is not open for applications');

  const now = new Date();
  if (opp.opensAt && opp.opensAt > now) throw new AppError(409, 'Applications have not opened yet');
  if (opp.closesAt && opp.closesAt < now) throw new AppError(409, 'Applications for this opportunity have closed');

  // A student already on an active placement is not looking for one.
  const placed = await prisma.placement.findFirst({
    where: { studentId: actor.id, isCurrent: true, placementStatus: 'active' },
    select: { id: true },
  });
  if (placed) throw new AppError(409, 'You already have an active placement');

  if (opp.minAcademicLevel) {
    const me = await prisma.user.findUnique({ where: { id: actor.id }, select: { academicLevel: true } });
    if (me?.academicLevel != null && me.academicLevel < opp.minAcademicLevel) {
      throw new AppError(422, `This opportunity is for level ${opp.minAcademicLevel} and above`);
    }
  }

  const existing = await prisma.opportunityApplication.findUnique({
    where: { opportunityId_studentId: { opportunityId, studentId: actor.id } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'You have already applied to this opportunity');

  return prisma.$transaction(async (tx) => {
    const app = await tx.opportunityApplication.create({
      data: {
        opportunityId,
        studentId: actor.id,
        statement: input.statement ?? null,
        cvDocumentId: input.cvDocumentId ?? null,
      },
    });
    // Append-only: this is what the applications trend is computed from, so the
    // chart reads history rather than a snapshot that forgot its own past.
    await tx.applicationEvent.create({
      data: { applicationId: app.id, type: 'submitted', toStatus: 'pending', actorId: actor.id },
    });
    return tx.opportunityApplication.findUniqueOrThrow({ where: { id: app.id }, select: APP_SELECT });
  });
}

export async function listApplications(actor: Actor, opts: { status?: string; limit?: number } = {}) {
  const where: Record<string, unknown> = {};
  if (actor.role === 'student') where.studentId = actor.id;
  else if (!isStaff(actor)) throw new AppError(403, 'Access denied');
  if (opts.status) where.status = opts.status;

  return prisma.opportunityApplication.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    take: opts.limit ?? 20,
    select: APP_SELECT,
  });
}

export async function decideApplication(actor: Actor, id: string, input: z.infer<typeof decideApplicationSchema>) {
  const app = await prisma.opportunityApplication.findUnique({
    where: { id },
    select: { id: true, status: true, studentId: true },
  });
  if (!app) throw new AppError(404, 'Application not found');

  assertTransition(app.status, input.status, actor.role, app.studentId === actor.id);

  return prisma.$transaction(async (tx) => {
    await tx.opportunityApplication.update({
      where: { id },
      data: {
        status: input.status,
        statusChangedAt: new Date(),
        decidedById: actor.id,
        decisionNote: input.note ?? null,
      },
    });
    await tx.applicationEvent.create({
      data: {
        applicationId: id,
        type: input.status === 'withdrawn' ? 'withdrawn' : 'status_changed',
        fromStatus: app.status,
        toStatus: input.status,
        actorId: actor.id,
        note: input.note ?? null,
      },
    });
    return tx.opportunityApplication.findUniqueOrThrow({ where: { id }, select: APP_SELECT });
  }).then(async (updated) => {
    if (app.studentId !== actor.id) {
      await createNotification({
        userId: app.studentId,
        type: 'system',
        title: `Your application is now ${input.status.replace(/_/g, ' ')}`,
        body: updated.opportunity.title,
        link: '/student/dashboard',
      }).catch(() => undefined);
    }
    return updated;
  });
}

/**
 * Applications vs shortlisted per day, read from the append-only event log —
 * which is why this is a real trend and not a snapshot. Returns [] when there
 * is no history; the caller renders "—" rather than a flat zero line.
 */
export async function applicationTrend(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const events = await prisma.applicationEvent.findMany({
    where: { createdAt: { gte: since } },
    select: { type: true, toStatus: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (events.length === 0) return [];

  const buckets = new Map<string, { day: string; applications: number; shortlisted: number }>();
  for (const e of events) {
    const day = e.createdAt.toISOString().slice(0, 10);
    const row = buckets.get(day) ?? { day, applications: 0, shortlisted: 0 };
    if (e.type === 'submitted') row.applications += 1;
    if (e.toStatus === 'shortlisted') row.shortlisted += 1;
    buckets.set(day, row);
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}

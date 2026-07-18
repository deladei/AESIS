/**
 * DB-integration tests for the industry-supervisor token gate. The
 * verification control's teeth are a Postgres trigger
 * (fn_assessment_token_gate) — mocks cannot prove it, so these run against the
 * dedicated local test database (aesis_logbook_test), like the entries suite.
 */
import dotenv from 'dotenv';

dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/errorHandler';
import { issueAssessmentToken, resolveAssessmentToken } from '../industry.token';
import type { Actor } from '../../entries/entries.policy';

jest.setTimeout(60_000);

let deptId: string;
let yearId: string;
let coordinator: Actor;
let supervisorA: Actor;
let student: Actor;
let placementId: string;
let dbAvailable = true;

async function reachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function mkUser(role: Actor['role'], tag: string): Promise<Actor> {
  const u = await prisma.user.create({
    data: {
      email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@cs.edu.gh`,
      passwordHash: 'x',
      role: role as never,
      firstName: tag,
      lastName: 'Test',
      departmentId: deptId,
    },
  });
  return { id: u.id, role };
}

async function mkIndustrySupervisor(status: 'unverified' | 'coordinator_approved' | 'visit_confirmed' | 'rejected') {
  return prisma.industrySupervisor.create({
    data: {
      placementId,
      name: 'Kofi Asante',
      email: 'kofi.asante@vodafone.com.gh',
      emailDomainType: 'company',
      verificationStatus: status,
    },
  });
}

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE assessment_token, industry_supervisor, placements, notifications,
     users, academic_years, departments RESTART IDENTITY CASCADE`,
  );

  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;
  const year = await prisma.academicYear.create({
    data: { label: '2025/2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31') },
  });
  yearId = year.id;

  coordinator = await mkUser('coordinator', 'coord');
  supervisorA = await mkUser('academic_supervisor', 'supA');
  student = await mkUser('student', 'stud');

  const p = await prisma.placement.create({
    data: { studentId: student.id, academicSupervisorId: supervisorA.id, academicYearId: yearId },
  });
  placementId = p.id;
});

afterAll(async () => {
  if (dbAvailable) await prisma.$disconnect();
});

const itdb = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) {
      console.warn(`[skip] ${name} — test DB unreachable`);
      return;
    }
    await fn();
  });

describe('assessment_token verification gate (DB trigger)', () => {
  itdb('final_assessment for an UNVERIFIED supervisor is rejected by the database (test 17)', async () => {
    const sup = await mkIndustrySupervisor('unverified');
    await expect(
      issueAssessmentToken(coordinator, sup.id, { purpose: 'final_assessment' }),
    ).rejects.toMatchObject({ statusCode: 409 });

    // Straight Prisma insert (bypassing the service) hits the same wall — the
    // control lives in the DB, not in application code.
    await expect(
      prisma.assessmentToken.create({
        data: {
          tokenHash: 'deadbeef',
          placementId,
          industrySupervisorId: sup.id,
          purpose: 'final_assessment',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ).rejects.toThrow(/verified industry supervisor/);
  });

  itdb('final_assessment for a rejected supervisor is rejected', async () => {
    const sup = await mkIndustrySupervisor('rejected');
    await expect(
      issueAssessmentToken(coordinator, sup.id, { purpose: 'final_assessment' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  itdb('coordinator_approved and visit_confirmed supervisors may receive the form', async () => {
    const approved = await mkIndustrySupervisor('coordinator_approved');
    const confirmed = await mkIndustrySupervisor('visit_confirmed');

    const t1 = await issueAssessmentToken(coordinator, approved.id, { purpose: 'final_assessment' });
    const t2 = await issueAssessmentToken(supervisorA, confirmed.id, { purpose: 'final_assessment' });
    expect(t1.token).toHaveLength(64);
    expect(t2.token).toHaveLength(64);
  });

  itdb('weekly_comment token needs a week number (DB + service)', async () => {
    const sup = await mkIndustrySupervisor('unverified'); // weekly does NOT need verification
    await expect(
      issueAssessmentToken(coordinator, sup.id, { purpose: 'weekly_comment' }),
    ).rejects.toMatchObject({ statusCode: 422 });

    await expect(
      prisma.assessmentToken.create({
        data: {
          tokenHash: 'cafebabe',
          placementId,
          industrySupervisorId: sup.id,
          purpose: 'weekly_comment',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ).rejects.toThrow(/week_number/);

    const okToken = await issueAssessmentToken(coordinator, sup.id, { purpose: 'weekly_comment', weekNumber: 3 });
    expect(okToken.token).toBeDefined();
  });

  itdb('student may not issue tokens', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    await expect(
      issueAssessmentToken(student, sup.id, { purpose: 'final_assessment' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  itdb('resolve: valid → row; wrong purpose → 404; used → 410; expired → 410; raw never stored', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    const { token, tokenId } = await issueAssessmentToken(coordinator, sup.id, { purpose: 'final_assessment' });

    // Raw token is nowhere in the DB.
    const stored = await prisma.assessmentToken.findUniqueOrThrow({ where: { id: tokenId } });
    expect(stored.tokenHash).not.toBe(token);

    const resolved = await resolveAssessmentToken(token, 'final_assessment');
    expect(resolved.id).toBe(tokenId);

    await expect(resolveAssessmentToken(token, 'weekly_comment')).rejects.toBeInstanceOf(AppError);

    await prisma.assessmentToken.update({ where: { id: tokenId }, data: { usedAt: new Date() } });
    await expect(resolveAssessmentToken(token, 'final_assessment')).rejects.toMatchObject({ statusCode: 410 });

    await prisma.assessmentToken.update({
      where: { id: tokenId },
      data: { usedAt: null, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(resolveAssessmentToken(token, 'final_assessment')).rejects.toMatchObject({ statusCode: 410 });
  });
});

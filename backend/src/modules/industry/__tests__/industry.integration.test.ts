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

jest.mock('../../../shared/utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  buildWeeklyCommentInviteEmail: jest.fn(() => '<html>weekly</html>'),
  buildAssessmentInviteEmail: jest.fn(() => '<html>assessment</html>'),
}));

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/errorHandler';
import { sendEmail } from '../../../shared/utils/email';
import { issueAssessmentToken, resolveAssessmentToken } from '../industry.token';

const mockSendEmail = sendEmail as jest.Mock;
import {
  submitPaperAssessment,
  submitDigitalAssessment,
  listIndustryAssessments,
} from '../industry.assessment';
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
    `TRUNCATE assessment_industry, assessment_token, industry_supervisor, final_grades,
     placements, notifications, users, academic_years, departments RESTART IDENTITY CASCADE`,
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

  itdb('issue returns a purpose-scoped public link', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    const weekly = await issueAssessmentToken(coordinator, sup.id, { purpose: 'weekly_comment', weekNumber: 4 });
    expect(weekly.url).toBe(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/weekly-comment/${weekly.token}`);

    const assessment = await issueAssessmentToken(coordinator, sup.id, { purpose: 'final_assessment' });
    expect(assessment.url).toBe(`${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/grade/${assessment.token}`);
  });

  itdb('send=true emails the link to the supervisor and reports the address', async () => {
    mockSendEmail.mockClear();
    const sup = await mkIndustrySupervisor('unverified'); // has email in fixture
    const res = await issueAssessmentToken(coordinator, sup.id, { purpose: 'weekly_comment', weekNumber: 5, send: true });
    expect(res.emailedTo).toBe('kofi.asante@vodafone.com.gh');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'kofi.asante@vodafone.com.gh', subject: expect.stringContaining('week 5') }),
    );
  });

  itdb('send=true with no email on record → 422, no token minted', async () => {
    mockSendEmail.mockClear();
    const sup = await prisma.industrySupervisor.create({
      data: { placementId, name: 'Yaa Mensah', verificationStatus: 'unverified' },
    });
    await expect(
      issueAssessmentToken(coordinator, sup.id, { purpose: 'weekly_comment', weekNumber: 6, send: true }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    const count = await prisma.assessmentToken.count({ where: { industrySupervisorId: sup.id } });
    expect(count).toBe(0);
  });

  itdb('student may not issue tokens', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    await expect(
      issueAssessmentToken(student, sup.id, { purpose: 'final_assessment' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  itdb('7-criterion form: DB rejects over-max criteria, wrong totals, and evidence-less rows', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    const base = {
      placementId,
      industrySupervisorId: sup.id,
      attendance: 18, punctuality: 14, cooperation: 9, aptitude: 13,
      understanding: 17, safety: 8, autonomy: 9,
      rawTotal: 88,
      reportingOfficerName: 'Kofi Asante',
      origin: 'paper' as const,
      scanUrl: 'https://files.example/scan.pdf',
      enteredById: coordinator.id,
    };

    // attendance beyond the instrument's 20 → CHECK violation
    await expect(
      prisma.assessmentIndustry.create({ data: { ...base, attendance: 21, rawTotal: 91 } }),
    ).rejects.toThrow();

    // stored total that is not the criteria sum → CHECK violation
    await expect(
      prisma.assessmentIndustry.create({ data: { ...base, rawTotal: 99 } }),
    ).rejects.toThrow();

    // paper with no scan (18) → CHECK violation
    await expect(
      prisma.assessmentIndustry.create({ data: { ...base, scanUrl: null } }),
    ).rejects.toThrow();

    // digital naming a staff enterer (18a) → CHECK violation
    await expect(
      prisma.assessmentIndustry.create({
        data: { ...base, origin: 'digital', tokenId: 'tok', scanUrl: null },
      }),
    ).rejects.toThrow();

    // the valid paper row lands
    const okRow = await prisma.assessmentIndustry.create({ data: base });
    expect(okRow.rawTotal).toBe(88);
    await prisma.assessmentIndustry.delete({ where: { id: okRow.id } });
  });

  itdb('digital submit consumes the token and maps raw_total onto the grade spine', async () => {
    const sup = await mkIndustrySupervisor('visit_confirmed');
    const { token } = await issueAssessmentToken(coordinator, sup.id, { purpose: 'final_assessment' });

    const scores = {
      attendance: 18, punctuality: 12, cooperation: 10, aptitude: 14,
      understanding: 16, safety: 9, autonomy: 8,
      reportingOfficerName: 'Kofi Asante',
    };
    const result = await submitDigitalAssessment(token, scores);
    expect(result.rawTotal).toBe(87);

    const grade = await prisma.finalGrade.findUniqueOrThrow({ where: { placementId } });
    expect(grade.industryRaw).toBe(87);

    // Single use: same link again → 410
    await expect(submitDigitalAssessment(token, scores)).rejects.toMatchObject({ statusCode: 410 });

    const stored = await prisma.assessmentIndustry.findFirstOrThrow({
      where: { placementId, industrySupervisorId: sup.id },
    });
    expect(stored.origin).toBe('digital');
    expect(stored.enteredById).toBeNull();
  });

  itdb('paper submit requires staff; students and supervisors cannot read assessments', async () => {
    const sup = await mkIndustrySupervisor('coordinator_approved');
    const input = {
      industrySupervisorId: sup.id,
      attendance: 15, punctuality: 10, cooperation: 8, aptitude: 12,
      understanding: 15, safety: 7, autonomy: 7,
      reportingOfficerName: 'Adjoa Osei',
      scanUrl: 'https://files.example/evaluation-scan.pdf',
    };

    await expect(submitPaperAssessment(student, placementId, input)).rejects.toMatchObject({ statusCode: 403 });

    const row = await submitPaperAssessment(coordinator, placementId, input);
    expect(row.rawTotal).toBe(74);
    expect(row.origin).toBe('paper');

    // Sealed-envelope rule: academic supervisor AND student get 403 (tests 1, 5)
    await expect(listIndustryAssessments(student, placementId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(listIndustryAssessments(supervisorA, placementId)).rejects.toMatchObject({ statusCode: 403 });

    const staffView = await listIndustryAssessments(coordinator, placementId);
    expect(staffView.length).toBeGreaterThan(0);
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

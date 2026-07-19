/**
 * DB-integration tests for the FORMATIVE weekly-comment channel. The evidence
 * rule (paper → scan + enterer; digital → token, no enterer) is a Postgres
 * CHECK and the single-use token consumption is transactional — mocks cannot
 * prove either, so these run against aesis_logbook_test like the token suite.
 */
import dotenv from 'dotenv';

dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/errorHandler';
import { issueAssessmentToken } from '../industry.token';
import {
  listWeeklyComments,
  submitPaperWeeklyComment,
  getWeeklyCommentFormContext,
  submitDigitalWeeklyComment,
} from '../industry.weekly';
import type { Actor } from '../../entries/entries.policy';

jest.setTimeout(60_000);

let deptId: string;
let yearId: string;
let coordinator: Actor;
let supervisorA: Actor;
let student: Actor;
let otherStudent: Actor;
let placementId: string;
let industrySupervisorId: string;
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

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE industry_weekly_comment, assessment_industry, assessment_token, industry_supervisor,
     final_grades, placements, notifications, users, academic_years, departments RESTART IDENTITY CASCADE`,
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
  otherStudent = await mkUser('student', 'stud2');

  const p = await prisma.placement.create({
    data: { studentId: student.id, academicSupervisorId: supervisorA.id, academicYearId: yearId },
  });
  placementId = p.id;

  const sup = await prisma.industrySupervisor.create({
    data: {
      placementId,
      name: 'Akosua Frimpong',
      departmentUnit: 'Networks',
      email: 'akosua.frimpong@mtn.com.gh',
      emailDomainType: 'company',
    },
  });
  industrySupervisorId = sup.id;
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

describe('digital weekly comment (tokenised link)', () => {
  itdb('form context + submit: week comes from the token, token consumed atomically', async () => {
    const issued = await issueAssessmentToken(coordinator, industrySupervisorId, {
      purpose: 'weekly_comment',
      weekNumber: 3,
    });

    const ctx = await getWeeklyCommentFormContext(issued.token);
    expect(ctx.weekNumber).toBe(3);
    expect(ctx.supervisorName).toBe('Akosua Frimpong');
    expect(ctx.studentName).toContain('stud');

    const result = await submitDigitalWeeklyComment(issued.token, {
      comment: 'Kwabena handled the router configuration confidently this week.',
    });
    expect(result.weekNumber).toBe(3);

    const row = await prisma.industryWeeklyComment.findFirstOrThrow({
      where: { placementId, weekNumber: 3 },
    });
    expect(row.origin).toBe('digital');
    expect(row.tokenId).toBe(issued.tokenId);
    expect(row.enteredById).toBeNull();
    expect(row.supervisorName).toBe('Akosua Frimpong');
    expect(row.departmentUnit).toBe('Networks');
    expect(row.studentId).toBe(student.id);

    // Single-use: the same link cannot submit twice.
    await expect(
      submitDigitalWeeklyComment(issued.token, { comment: 'second try' }),
    ).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe('paper weekly comment (staff keys in the scan)', () => {
  itdb('coordinator entry persists with scan + enterer evidence', async () => {
    const row = await submitPaperWeeklyComment(coordinator, placementId, {
      industrySupervisorId,
      weekNumber: 4,
      comment: 'Good improvement on cable termination and safety habits.',
      commentDate: new Date('2026-07-10'),
      scanUrl: 'https://files.example.com/scans/week4.pdf',
    });
    expect(row.origin).toBe('paper');
    expect(row.enteredById).toBe(coordinator.id);
    expect(row.tokenId).toBeNull();
    expect(row.supervisorName).toBe('Akosua Frimpong'); // snapshot default from the record
  });

  itdb('non-staff cannot enter a paper comment (403)', async () => {
    const input = {
      industrySupervisorId,
      weekNumber: 5,
      comment: 'not allowed',
      commentDate: new Date(),
      scanUrl: 'https://files.example.com/scans/week5.pdf',
    };
    for (const actor of [student, supervisorA]) {
      await expect(submitPaperWeeklyComment(actor, placementId, input)).rejects.toMatchObject({
        statusCode: 403,
      });
    }
  });

  itdb("supervisor from another placement is a 404, not someone else's record", async () => {
    const p2 = await prisma.placement.create({
      data: { studentId: otherStudent.id, academicYearId: yearId, isCurrent: false },
    });
    const foreign = await prisma.industrySupervisor.create({
      data: { placementId: p2.id, name: 'Kojo Owusu', emailDomainType: 'none' },
    });
    await expect(
      submitPaperWeeklyComment(coordinator, placementId, {
        industrySupervisorId: foreign.id,
        weekNumber: 6,
        comment: 'wrong placement',
        commentDate: new Date(),
        scanUrl: 'https://files.example.com/scans/week6.pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('evidence rule — DB CHECK teeth', () => {
  itdb('paper without a scan/enterer and digital with an enterer are both rejected by the database', async () => {
    const common = {
      id: undefined as never,
      placementId,
      studentId: student.id,
      industrySupervisorId,
      weekNumber: 9,
      comment: 'raw insert',
      supervisorName: 'Akosua Frimpong',
      commentDate: new Date(),
    };
    // Paper with no evidence at all.
    await expect(
      prisma.industryWeeklyComment.create({
        data: { ...common, origin: 'paper', scanUrl: null, enteredById: null, tokenId: null },
      }),
    ).rejects.toThrow(/iwc_paper_needs_evidence|check constraint/i);
    // Digital keyed in by staff — the two evidence paths must not blur.
    await expect(
      prisma.industryWeeklyComment.create({
        data: { ...common, origin: 'digital', tokenId: null, enteredById: coordinator.id },
      }),
    ).rejects.toThrow(/iwc_paper_needs_evidence|check constraint/i);
  });
});

describe('formative read scope', () => {
  itdb('student reads their own; another student is refused; assigned supervisor reads', async () => {
    const own = await listWeeklyComments(student, placementId);
    expect(own.length).toBeGreaterThan(0);

    await expect(listWeeklyComments(otherStudent, placementId)).rejects.toBeInstanceOf(AppError);

    const sup = await listWeeklyComments(supervisorA, placementId, 3);
    expect(sup).toHaveLength(1);
    expect(sup[0].weekNumber).toBe(3);
  });
});

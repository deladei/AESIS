/**
 * DB-integration tests for the final-grade release guard. The rules — no
 * release without sign-off, no release with a missing component, a released
 * grade is immutable — are enforced by Postgres triggers
 * (fn_final_grade_release_guard / fn_final_grade_insert_guard). Mocks cannot
 * prove a trigger, so these run against the dedicated local test database
 * (aesis_logbook_test), like the entries, industry, and transfers suites.
 */
import dotenv from 'dotenv';

dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';

jest.setTimeout(60_000);

let deptId: string;
let yearId: string;
let hodId: string;
let studentId: string;
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

const fullScores = {
  industryRaw: 82, universityRaw: 75, reportRaw: 68, logbookRaw: 90,
  industryWeighted: 24.6, universityWeighted: 22.5, reportWeighted: 20.4, logbookWeighted: 9,
  total: 76.5,
};

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE final_grades, placement_transfer_request, assessment_industry,
     assessment_token, industry_supervisor, placements, notifications,
     audit_logs, users, academic_years, departments RESTART IDENTITY CASCADE`,
  );

  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;
  const year = await prisma.academicYear.create({
    data: { label: '2025/2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31') },
  });
  yearId = year.id;

  const hod = await prisma.user.create({
    data: {
      email: `hod-${Date.now()}@cs.edu.gh`, passwordHash: 'x', role: 'hod',
      firstName: 'Abena', lastName: 'Owusu', departmentId: deptId,
    },
  });
  hodId = hod.id;
  const student = await prisma.user.create({
    data: {
      email: `stud-${Date.now()}@cs.edu.gh`, passwordHash: 'x', role: 'student',
      firstName: 'Kwame', lastName: 'Boateng', departmentId: deptId,
    },
  });
  studentId = student.id;

  const p = await prisma.placement.create({
    data: { studentId, academicYearId: yearId, placementStatus: 'active' },
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

describe('final-grade release guard (DB triggers)', () => {
  itdb('a grade cannot be born released', async () => {
    await expect(
      prisma.finalGrade.create({
        data: { placementId, ...fullScores, status: 'released', signedOffById: hodId },
      }),
    ).rejects.toThrow(/already released/);
  });

  itdb('release without sign-off is rejected by the database', async () => {
    await prisma.finalGrade.create({ data: { placementId, ...fullScores, status: 'approved' } });
    await expect(
      prisma.finalGrade.update({
        where: { placementId },
        data: { status: 'released' },
      }),
    ).rejects.toThrow(/signed off/);
  });

  itdb('release with a missing component is rejected, even when signed off', async () => {
    await expect(
      prisma.finalGrade.update({
        where: { placementId },
        data: { status: 'released', signedOffById: hodId, industryWeighted: null },
      }),
    ).rejects.toThrow(/component is missing/);
  });

  itdb('a complete, signed-off grade releases — and the DB stamps released_at', async () => {
    const released = await prisma.finalGrade.update({
      where: { placementId },
      data: { status: 'released', signedOffById: hodId, signedOffAt: new Date() },
    });
    expect(released.status).toBe('released');
    expect(released.releasedAt).not.toBeNull();
  });

  itdb('a released grade is immutable — every column, every path', async () => {
    await expect(
      prisma.finalGrade.update({ where: { placementId }, data: { industryRaw: 95 } }),
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.finalGrade.update({ where: { placementId }, data: { coordinatorOverride: 80 } }),
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.finalGrade.update({ where: { placementId }, data: { status: 'draft' } }),
    ).rejects.toThrow(/immutable/);
  });
});

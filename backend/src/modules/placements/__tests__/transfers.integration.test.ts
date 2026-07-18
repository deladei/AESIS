/**
 * DB-integration tests for change-of-attachment. The teeth are two partial
 * unique indexes — one current placement per student (acceptance test 14) and
 * one open transfer request per placement — plus the approve transaction.
 * Mocks cannot prove an index, so these run against the dedicated local test
 * database (aesis_logbook_test), like the entries and industry suites.
 */
import dotenv from 'dotenv';

dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';
import {
  createTransferRequest,
  decideTransferRequest,
} from '../transfers.service';

jest.setTimeout(60_000);

let deptId: string;
let yearId: string;
let coordinatorId: string;
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

async function mkUser(role: string, tag: string): Promise<string> {
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
  return u.id;
}

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    `TRUNCATE placement_transfer_request, assessment_industry, assessment_token,
     industry_supervisor, final_grades, placements, companies, notifications,
     audit_logs, users, academic_years, departments RESTART IDENTITY CASCADE`,
  );

  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;
  const year = await prisma.academicYear.create({
    data: { label: '2025/2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31') },
  });
  yearId = year.id;

  coordinatorId = await mkUser('coordinator', 'coord');
  studentId = await mkUser('student', 'stud');

  const p = await prisma.placement.create({
    data: {
      studentId,
      academicYearId:  yearId,
      placementStatus: 'active',
      region:          'ashanti',
      endDate:         new Date('2026-08-31'),
    },
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

describe('one current placement per student (partial unique index — test 14)', () => {
  itdb('a second is_current placement for the same student is rejected by the database', async () => {
    await expect(
      prisma.placement.create({
        data: { studentId, academicYearId: yearId, placementStatus: 'active' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itdb('a non-current historical placement is allowed', async () => {
    const p = await prisma.placement.create({
      data: { studentId, academicYearId: yearId, placementStatus: 'withdrawn', isCurrent: false },
    });
    expect(p.isCurrent).toBe(false);
  });
});

describe('change-of-attachment workflow', () => {
  itdb('one OPEN request per placement, DB-enforced', async () => {
    const input = {
      newCompanyName:    'Volta Fibre Networks',
      newCompanyAddress: '12 Lake Road, Ho, Volta Region',
      reason:            'The unit I was attached to has closed down its operations',
    };
    const first = await createTransferRequest(studentId, placementId, input);
    expect(first.status).toBe('requested');

    await expect(createTransferRequest(studentId, placementId, input))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  itdb('approval closes the old placement, opens a continuous successor, and audits', async () => {
    const open = await prisma.placementTransferRequest.findFirst({
      where: { fromPlacementId: placementId, status: 'requested' },
    });
    expect(open).not.toBeNull();

    const decided = await decideTransferRequest(open!.id, coordinatorId, {
      decision:               'approved',
      authorizationLetterUrl: 'https://files.example.com/letters/authorization.pdf',
      newRegion:              'volta',
    });

    expect(decided.status).toBe('approved');
    expect(decided.toPlacementId).not.toBeNull();

    const old = await prisma.placement.findUnique({ where: { id: placementId } });
    expect(old!.placementStatus).toBe('transferred_out');
    expect(old!.isCurrent).toBe(false);

    const successor = await prisma.placement.findUnique({ where: { id: decided.toPlacementId! } });
    expect(successor!.isCurrent).toBe(true);
    expect(successor!.placementStatus).toBe('active');
    expect(successor!.supersedesPlacementId).toBe(placementId);
    expect(successor!.region).toBe('volta');
    // Attachment window unchanged: the successor inherits the old end date.
    expect(successor!.endDate?.toISOString()).toBe(old!.endDate?.toISOString());

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: placementId, action: 'placement_status_change' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect((audit!.metadata as { change?: string }).change).toBe('transfer_approved');

    // The successor now holds the student's one current slot.
    await expect(
      prisma.placement.create({
        data: { studentId, academicYearId: yearId, placementStatus: 'active' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  itdb('a decided request cannot be decided again', async () => {
    const decidedRequest = await prisma.placementTransferRequest.findFirst({
      where: { fromPlacementId: placementId },
    });
    await expect(
      decideTransferRequest(decidedRequest!.id, coordinatorId, {
        decision: 'rejected', decisionNote: 'Duplicate decision attempt',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

/**
 * Integration tests for the SIWES daily logbook against a REAL Postgres.
 *
 * Mocks can't prove what matters here — the UNIQUE(student, work_date) anchor,
 * the created_at immutability trigger, the delete-denial trigger, and the
 * chain-aware week numbering — so these run against the dedicated local test
 * database (aesis_logbook_test). If the DB is unreachable the whole suite is
 * skipped rather than failing spuriously.
 */
import dotenv from 'dotenv';

// Point the prisma singleton at the test DB BEFORE importing it.
dotenv.config();
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://u:p@127.0.0.1:5432/x');
base.hostname = '127.0.0.1';
base.pathname = '/aesis_logbook_test';
process.env.DATABASE_URL = base.toString();

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/errorHandler';
import { todayUtc } from '../../entries/entry.dates';
import type { Actor } from '../../entries/entries.policy';
import { isoWeekday, weekNumberFor } from '../siwes.calendar';
import {
  saveDailyEntry,
  saveWeeklySummary,
  recordAbsence,
  createNonWorkingDay,
  getLogbookCalendar,
  chainPlacementIds,
} from '../siwes.service';

jest.setTimeout(60_000);

const DAY_MS = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

const today = todayUtc();
// Anchor the chain on the Monday three full weeks back, so "today" always sits
// in week 4+ regardless of the real calendar date the suite runs on.
const chainStart = addDays(today, -(21 + (isoWeekday(today) - 1)));
const chainEnd = addDays(chainStart, 8 * 7 - 1);

/** Most recent working days (Mon–Fri), newest first, starting from today. */
function recentWorkingDays(count: number): Date[] {
  const days: Date[] = [];
  for (let d = today; days.length < count; d = addDays(d, -1)) {
    if (isoWeekday(d) <= 5) days.push(d);
  }
  return days;
}

// ── Fixtures ──────────────────────────────────────────────────
let deptId: string;
let yearId: string;
let student: Actor;
let studentB: Actor;
let supervisor: Actor;
let coordinator: Actor;
let placementId: string;
let placementBId: string;

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

const entryInput = (workDate: Date) => ({
  placementId,
  workDate: iso(workDate),
  descriptionOfWork: 'Configured the workshop lathe and machined sample parts',
  newSkillsLearnt: 'Lathe setup and workshop safety procedure',
});

beforeAll(async () => {
  dbAvailable = await reachable();
  if (!dbAvailable) return;

  await prisma.$executeRawUnsafe(
    // logbook_entry now owns the days; entry_reflection replaced weekly_summary
    // (both folded in by 20260726000000_logbook_consolidation). CASCADE reaches
    // the children, but naming the parents keeps the intent readable.
    `TRUNCATE daily_entry, entry_reflection, logbook_entry, absence, non_working_day, cohort_configs,
     placements, users, academic_years, departments RESTART IDENTITY CASCADE`,
  );

  const dept = await prisma.department.create({ data: { name: 'Computer Science', code: 'CS' } });
  deptId = dept.id;
  const year = await prisma.academicYear.create({
    data: {
      label: '2025/2026',
      startDate: addDays(chainStart, -30),
      endDate: addDays(chainEnd, 60),
    },
  });
  yearId = year.id;
  await prisma.cohortConfig.create({
    data: { academicYearId: yearId, durationWeeks: 8, entryEditWindowDays: 2, syncGraceDays: 3 },
  });

  student = await mkUser('student', 'AmaMensah');
  studentB = await mkUser('student', 'KofiBoateng');
  supervisor = await mkUser('academic_supervisor', 'DrOwusu');
  coordinator = await mkUser('coordinator', 'MrsAsante');

  const p = await prisma.placement.create({
    data: {
      studentId: student.id,
      academicSupervisorId: supervisor.id,
      academicYearId: yearId,
      startDate: chainStart,
      endDate: chainEnd,
      placementStatus: 'active',
    },
  });
  placementId = p.id;

  const pb = await prisma.placement.create({
    data: {
      studentId: studentB.id,
      academicYearId: yearId,
      startDate: chainStart,
      endDate: chainEnd,
      placementStatus: 'active',
    },
  });
  placementBId = pb.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const itDb = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return console.warn('SKIP (no test DB):', name);
    await fn();
  });

describe('daily entries', () => {
  itDb('creates an entry with a chain-derived week number', async () => {
    const [day] = recentWorkingDays(1);
    const entry = await saveDailyEntry(student, entryInput(day));
    expect(entry.workDate).toBe(iso(day));
    expect(entry.weekNumber).toBe(weekNumberFor(day, chainStart));
    expect(entry.weekNumber).toBeGreaterThanOrEqual(4);
  });

  itDb('updates (not duplicates) the same day inside the edit window', async () => {
    const [day] = recentWorkingDays(1);
    const first = await saveDailyEntry(student, entryInput(day));
    const second = await saveDailyEntry(student, {
      ...entryInput(day),
      descriptionOfWork: 'Revised description after supervisor walkthrough',
    });
    expect(second.id).toBe(first.id);
    expect(second.descriptionOfWork).toContain('Revised');
    const count = await prisma.dailyEntry.count({
      where: { studentId: student.id, workDate: day },
    });
    expect(count).toBe(1);
  });

  itDb('flags a backfilled past day as loggedLate — derived, not stored', async () => {
    const day = recentWorkingDays(4)[3];
    const entry = await saveDailyEntry(student, entryInput(day));
    expect(entry.loggedLate).toBe(true);
    expect(entry.lateByDays).toBeGreaterThan(0);
  });

  itDb('rejects a future day', async () => {
    await expect(
      saveDailyEntry(student, entryInput(addDays(today, 1))),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  itDb('rejects a declared holiday — the classification teeth', async () => {
    const day = recentWorkingDays(6)[5];
    await createNonWorkingDay({
      academicYearId: yearId,
      day: iso(day),
      label: 'Republic Day',
    });
    await expect(saveDailyEntry(student, entryInput(day))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  itDb('locks an entry once the edit window has closed', async () => {
    const day = recentWorkingDays(3)[2];
    // created_at is settable at INSERT (the trigger guards UPDATE) — plant an
    // old row to age the window without sleeping.
    const week = weekNumberFor(day, chainStart);
    // Days hang off a week now (S87) — plant the owning entry first. Upsert,
    // not create: earlier cases in this suite share the DB and may already have
    // opened this student-week, and (studentId, weekNumber) is unique.
    const owningWeek = await prisma.logbookEntry.upsert({
      where: { studentId_weekNumber: { studentId: student.id, weekNumber: week } },
      update: {},
      create: {
        studentId: student.id,
        placementId,
        weekNumber: week,
        periodStart: addDays(chainStart, (week - 1) * 7),
        periodEnd: addDays(chainStart, (week - 1) * 7 + 6),
        status: 'draft',
      },
    });
    await prisma.dailyEntry.create({
      data: {
        entryId: owningWeek.id,
        studentId: student.id,
        placementId,
        weekNumber: week,
        workDate: day,
        descriptionOfWork: 'original',
        newSkillsLearnt: 'original',
        createdAt: new Date(Date.now() - 5 * DAY_MS),
      },
    });
    await expect(saveDailyEntry(student, entryInput(day))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  itDb('another student cannot write to the placement', async () => {
    const [day] = recentWorkingDays(1);
    await expect(saveDailyEntry(studentB, entryInput(day))).rejects.toBeInstanceOf(AppError);
  });

  itDb('supervisors never author logbook content', async () => {
    const [day] = recentWorkingDays(1);
    await expect(saveDailyEntry(supervisor, entryInput(day))).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('DB teeth', () => {
  itDb('created_at is immutable — trigger rejects tampering', async () => {
    const row = await prisma.dailyEntry.findFirst({ where: { studentId: student.id } });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE daily_entry SET created_at = created_at - interval '10 days' WHERE id = '${row!.id}'`,
      ),
    ).rejects.toThrow(/immutable/);
  });

  itDb('daily entries cannot be deleted — evidence', async () => {
    const row = await prisma.dailyEntry.findFirst({ where: { studentId: student.id } });
    await expect(prisma.dailyEntry.delete({ where: { id: row!.id } })).rejects.toThrow(
      /cannot be deleted/,
    );
  });

  itDb('weekly reports cannot be deleted — evidence', async () => {
    // The trainee's weekly report is the week's reflection since S87; it keeps
    // the delete-denial guarantee the old weekly_summary table had.
    const week = await prisma.logbookEntry.create({
      data: {
        studentId: studentB.id,
        placementId: placementBId,
        weekNumber: 1,
        periodStart: chainStart,
        periodEnd: addDays(chainStart, 6),
        status: 'draft',
      },
    });
    await prisma.entryReflection.create({
      data: { entryId: week.id, learning: 'Week one at the plant', challenges: '' },
    });
    await expect(
      prisma.entryReflection.delete({ where: { entryId: week.id } }),
    ).rejects.toThrow(/cannot be deleted/);
  });
});

describe('absences', () => {
  itDb('a student self-reports sick; recorder identity is kept', async () => {
    const day = recentWorkingDays(5)[4];
    const absence = await recordAbsence(student, {
      placementId,
      absenceDate: iso(day),
      kind: 'sick',
    });
    expect(absence.recordedById).toBe(student.id);
  });

  itDb('a student may not record an unexcused absence', async () => {
    const day = recentWorkingDays(7)[6];
    await expect(
      recordAbsence(student, { placementId, absenceDate: iso(day), kind: 'unexcused' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  itDb('the assigned supervisor records an unexcused no-show', async () => {
    const day = recentWorkingDays(7)[6];
    const absence = await recordAbsence(supervisor, {
      placementId,
      absenceDate: iso(day),
      kind: 'unexcused',
    });
    expect(absence.kind).toBe('unexcused');
    expect(absence.recordedById).toBe(supervisor.id);
  });

  itDb('a day cannot be both an absence and a logged entry', async () => {
    const sickDay = recentWorkingDays(5)[4];
    await expect(saveDailyEntry(student, entryInput(sickDay))).rejects.toMatchObject({
      statusCode: 409,
    });
    const [loggedDay] = recentWorkingDays(1);
    await expect(
      recordAbsence(student, { placementId, absenceDate: iso(loggedDay), kind: 'sick' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  itDb('duplicate absence for the same day is a 409', async () => {
    const day = recentWorkingDays(5)[4];
    await expect(
      recordAbsence(student, {
        placementId,
        absenceDate: iso(day),
        kind: 'permitted',
        reason: 'Clinic review',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('weekly summaries', () => {
  itDb('derives weekEnding from the chain calendar', async () => {
    const summary = await saveWeeklySummary(student, {
      placementId,
      weekNumber: 1,
      reportText: 'Induction, safety training and first machining tasks.',
    });
    expect(summary.weekEnding).toBe(iso(addDays(chainStart, 6)));
  });

  itDb('rejects a week beyond the attachment span', async () => {
    await expect(
      saveWeeklySummary(student, { placementId, weekNumber: 30, reportText: 'x' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  itDb('rejects a week that has not started', async () => {
    await expect(
      saveWeeklySummary(student, { placementId, weekNumber: 8, reportText: 'x' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('chain-aware calendar', () => {
  itDb('classifies days, carries the holiday, and flags missing working days', async () => {
    const calendar = await getLogbookCalendar(supervisor, placementId, {});
    expect(calendar.chainStart).toBe(iso(chainStart));
    expect(calendar.totalWeeks).toBe(8);

    const holiday = calendar.days.find((d) => d.class === 'non_working');
    expect(holiday).toBeDefined();
    expect(holiday!.missing).toBe(false); // never fires on a holiday

    const missing = calendar.days.filter((d) => d.missing);
    for (const day of missing) {
      expect(day.class).toBe('working');
      expect(day.entry).toBeNull();
      expect(day.absence).toBeNull();
    }

    const logged = calendar.days.filter((d) => d.entry !== null);
    expect(logged.length).toBeGreaterThanOrEqual(3);
    expect(calendar.weeklySummaries.length).toBe(1);
  });

  itDb('spans the whole attachment, not just the weeks already lived', async () => {
    // The logbook builds its week rail by grouping these days, and prints
    // `totalWeeks` in the header right above it. Clamping the range to today
    // made an 8-week attachment render 4 weeks under a header saying 8. The
    // two must agree, so assert the invariant rather than the symptom.
    const calendar = await getLogbookCalendar(student, placementId, {});
    const weeks = new Set(calendar.days.map((d) => d.weekNumber));

    expect(weeks.size).toBe(calendar.totalWeeks);
    expect([...weeks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(calendar.chainEnd).toBe(iso(chainEnd));

    // Weeks that have not started are carried as upcoming days, never as days
    // the student has failed to log.
    const future = calendar.days.filter((d) => d.date > iso(today));
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((d) => d.missing === false)).toBe(true);
  });

  itDb('coordinators read; students see only their own placement', async () => {
    await expect(getLogbookCalendar(coordinator, placementId, {})).resolves.toBeDefined();
    await expect(getLogbookCalendar(studentB, placementId, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  itDb('week numbering never resets across an approved transfer', async () => {
    // Close the original placement and open a successor mid-attachment.
    await prisma.placement.update({
      where: { id: placementId },
      data: { placementStatus: 'transferred_out', isCurrent: false },
    });
    const successor = await prisma.placement.create({
      data: {
        studentId: student.id,
        academicYearId: yearId,
        startDate: addDays(today, -2),
        endDate: chainEnd,
        placementStatus: 'active',
        isCurrent: true,
        supersedesPlacementId: placementId,
      },
    });

    const [day] = recentWorkingDays(1);
    const calendar = await getLogbookCalendar(student, successor.id, {});
    // Week numbers anchor on the CHAIN start, not the successor's start date.
    const todayRow = calendar.days.find((d) => d.date === iso(day));
    expect(todayRow?.weekNumber).toBe(weekNumberFor(day, chainStart));
    expect(calendar.chainStart).toBe(iso(chainStart));

    // Reads that mean "this student's logbook" have to span the chain from
    // EITHER end, or the transferred student's earlier weeks come back as if
    // they were never written.
    const fromSuccessor = await chainPlacementIds(successor.id);
    const fromOriginal = await chainPlacementIds(placementId);
    expect(new Set(fromSuccessor)).toEqual(new Set([placementId, successor.id]));
    expect(new Set(fromOriginal)).toEqual(new Set(fromSuccessor));
  });

  itDb('a placement with no transfer is a chain of one', async () => {
    expect(await chainPlacementIds(placementBId)).toEqual([placementBId]);
  });
});

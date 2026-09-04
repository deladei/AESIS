jest.mock('../../../config/prisma', () => ({
  prisma: {
    logbookEntry: { findUnique: jest.fn() },
    placement: { findUnique: jest.fn() },
    cohortConfig: { findFirst: jest.fn() },
    nonWorkingDay: { findMany: jest.fn() },
    dailyEntry: { findMany: jest.fn() },
    absence: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import { evaluateWeekCompletion } from '../entries.autosubmit';
import type { Actor } from '../entries.policy';

const m = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const student: Actor = { id: 'stu-1', role: 'student' };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

// Mon 2 Mar 2026 – Sun 8 Mar 2026: five working days, Mon–Fri.
const WEEK = { periodStart: d('2026-03-02'), periodEnd: d('2026-03-08') };
const MON_TO_FRI = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'];

function seed(opts: {
  status?: string;
  logged?: string[];
  loggedWithoutContent?: string[];
  absences?: string[];
  holidays?: string[];
  workingDays?: number[];
  missingEntry?: boolean;
} = {}) {
  m.logbookEntry.findUnique.mockResolvedValue(
    opts.missingEntry ? null : {
      id: 'e1', status: opts.status ?? 'draft',
      placementId: 'p1', studentId: student.id, ...WEEK,
    },
  );
  m.placement.findUnique.mockResolvedValue({ academicYearId: 'y1' });
  m.cohortConfig.findFirst.mockResolvedValue({ workingDays: opts.workingDays ?? [1, 2, 3, 4, 5] });
  m.nonWorkingDay.findMany.mockResolvedValue((opts.holidays ?? []).map((h) => ({ day: d(h) })));
  m.dailyEntry.findMany.mockResolvedValue([
    ...(opts.logged ?? []).map((x) => ({ workDate: d(x), descriptionOfWork: 'did the work' })),
    ...(opts.loggedWithoutContent ?? []).map((x) => ({ workDate: d(x), descriptionOfWork: null })),
  ]);
  m.absence.findMany.mockResolvedValue((opts.absences ?? []).map((a) => ({ absenceDate: d(a) })));
}

beforeEach(() => jest.clearAllMocks());

const submit = jest.fn().mockResolvedValue(undefined);

describe('auto-submit on a complete week', () => {
  it('submits once all five working days are written up', async () => {
    seed({ logged: MON_TO_FRI });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out).toEqual({ submitted: true, complete: true, remaining: 0, workingDays: 5 });
    expect(submit).toHaveBeenCalledWith(student, 'e1');
  });

  it('goes through the normal submit path, not a direct status write', async () => {
    seed({ logged: MON_TO_FRI });
    await evaluateWeekCompletion(student, 'e1', submit);
    // The state machine, the append-only event and the supervisor notification
    // all live in submitEntry — auto-submit must not bypass them.
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe('report-only mode (what the save path and the week header use)', () => {
  it('reports a complete week without submitting it', async () => {
    // The whole point of the rework: completing the week does NOT send it.
    // The student is asked, and their status never changes under them.
    seed({ logged: MON_TO_FRI });
    const out = await evaluateWeekCompletion(student, 'e1', null);
    expect(out).toEqual({ submitted: false, complete: true, remaining: 0, workingDays: 5 });
    expect(submit).not.toHaveBeenCalled();
  });

  it('reports what is still outstanding on a partial week', async () => {
    seed({ logged: MON_TO_FRI.slice(0, 3) });
    const out = await evaluateWeekCompletion(student, 'e1', null);
    expect(out).toEqual({ submitted: false, complete: false, remaining: 2, workingDays: 5 });
  });
});

describe('a partial week is left alone', () => {
  it.each([1, 2, 3, 4])('does not submit with %i of 5 days logged', async (n) => {
    seed({ logged: MON_TO_FRI.slice(0, n) });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out.submitted).toBe(false);
    expect(out.remaining).toBe(5 - n);
    expect(submit).not.toHaveBeenCalled();
  });

  it('a day row with no content does not count as written up', async () => {
    // The attachment flow can create a status row before any narrative exists.
    seed({ logged: MON_TO_FRI.slice(0, 4), loggedWithoutContent: ['2026-03-06'] });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out.submitted).toBe(false);
    expect(out.remaining).toBe(1);
  });
});

describe('days the student could not work', () => {
  it('counts a recorded absence as accounted for', async () => {
    seed({ logged: MON_TO_FRI.slice(0, 4), absences: ['2026-03-06'] });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out.submitted).toBe(true);
  });

  it('a holiday is not a working day, so a four-day week submits on its fourth', async () => {
    seed({ logged: ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'], holidays: ['2026-03-06'] });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out).toEqual({ submitted: true, complete: true, remaining: 0, workingDays: 4 });
  });

  it('honours a cohort working-day pattern that is not Mon–Fri', async () => {
    seed({ logged: ['2026-03-02', '2026-03-03', '2026-03-04'], workingDays: [1, 2, 3] });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out).toEqual({ submitted: true, complete: true, remaining: 0, workingDays: 3 });
  });
});

describe('week states it must not touch', () => {
  it.each(['submitted', 'acknowledged', 'returned'])('leaves a %s week alone', async (status) => {
    seed({ status, logged: MON_TO_FRI });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out.submitted).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(['submitted', 'acknowledged'])(
    'reports a %s week as not complete even with every day logged',
    async (status) => {
      // `complete` means "could be submitted right now", not "all days are in".
      // A week already sent has nothing left to offer the student, so the
      // logbook must not show it a Submit button.
      seed({ status, logged: MON_TO_FRI });
      const out = await evaluateWeekCompletion(student, 'e1', null);
      expect(out.complete).toBe(false);
      expect(out.remaining).toBe(0);
    },
  );

  it('is a no-op when the entry has gone', async () => {
    seed({ missingEntry: true });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out).toEqual({ submitted: false, complete: false, remaining: 0, workingDays: 0 });
    expect(submit).not.toHaveBeenCalled();
  });

  it('is a no-op for a week with no working days at all', async () => {
    seed({ workingDays: [], holidays: MON_TO_FRI });
    const out = await evaluateWeekCompletion(student, 'e1', submit);
    expect(out.submitted).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });
});

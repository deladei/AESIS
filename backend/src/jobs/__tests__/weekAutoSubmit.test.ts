jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    logbookEntry: { findMany: jest.fn() },
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

// The real env parses process.env at import; this job only reads one optional
// number from it, and a test needs to vary that number.
jest.mock('../../config/env', () => ({ env: { BACKFILL_CUTOFF_DAYS: undefined } }));

jest.mock('../../modules/entries/entries.autosubmit', () => ({
  evaluateWeekCompletion: jest.fn(),
}));

jest.mock('../../modules/entries/entries.service', () => ({
  submitEntry: jest.fn(),
}));

import cron from 'node-cron';
import { runWeekAutoSubmit, scheduleWeekAutoSubmit } from '../weekAutoSubmit';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { evaluateWeekCompletion } from '../../modules/entries/entries.autosubmit';
import { submitEntry } from '../../modules/entries/entries.service';
import { DAY_GRACE_DAYS } from '../../modules/entries/entries.day.service';

const findMany = prisma.logbookEntry.findMany as jest.Mock;
const evaluate = evaluateWeekCompletion as jest.Mock;

const DAY_MS = 86_400_000;
const NOW = new Date('2026-07-29T20:00:00.000Z');

const week = (id: string, studentId: string, weekNumber: number) => ({ id, studentId, weekNumber });

/** What evaluateWeekCompletion returns for a week it did / did not submit. */
const submittedOutcome = { submitted: true, complete: true, remaining: 0, workingDays: 5 };
const incompleteOutcome = { submitted: false, complete: false, remaining: 2, workingDays: 5 };

beforeEach(() => {
  jest.clearAllMocks();
  findMany.mockResolvedValue([]);
  evaluate.mockResolvedValue(incompleteOutcome);
  (env as { BACKFILL_CUTOFF_DAYS?: number }).BACKFILL_CUTOFF_DAYS = undefined;
});

describe('scheduleWeekAutoSubmit', () => {
  it('runs nightly at 20:00 Ghana time', () => {
    scheduleWeekAutoSubmit();
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 20 * * *',
      expect.any(Function),
      // Not the container's local time: Render's clock is not Ghana's.
      expect.objectContaining({ timezone: 'Africa/Accra' }),
    );
  });
});

describe('which weeks the pass considers', () => {
  it('only looks at drafts whose grace window has run out', async () => {
    await runWeekAutoSubmit(NOW);

    const { where } = findMany.mock.calls[0][0];
    expect(where.status).toBe('draft');
    expect(where.periodEnd.lt).toEqual(new Date(NOW.getTime() - DAY_GRACE_DAYS * DAY_MS));
  });

  it('bounds the scan so an abandoned week is not reconsidered forever', async () => {
    await runWeekAutoSubmit(NOW);

    const { where } = findMany.mock.calls[0][0];
    // 8 weeks back. Without a lower bound the candidate set grows without
    // limit and every row costs several queries inside the evaluation.
    expect(where.periodEnd.gte).toEqual(new Date(NOW.getTime() - 8 * 7 * DAY_MS));
    expect(where.periodEnd.gte.getTime()).toBeLessThan(where.periodEnd.lt.getTime());
  });

  it('never scans past the backfill cutoff the API enforces', async () => {
    // submitEntry rejects anything older than BACKFILL_CUTOFF_DAYS with a 422.
    // Scanning further back would mean logging a failure for every abandoned
    // week, every night, forever — so the scan stops where the API stops.
    (env as { BACKFILL_CUTOFF_DAYS?: number }).BACKFILL_CUTOFF_DAYS = 21;

    await runWeekAutoSubmit(NOW);

    const { where } = findMany.mock.calls[0][0];
    expect(where.periodEnd.gte).toEqual(new Date(NOW.getTime() - 21 * DAY_MS));
  });

  it('keeps the 8-week bound when the cutoff is looser than it', async () => {
    (env as { BACKFILL_CUTOFF_DAYS?: number }).BACKFILL_CUTOFF_DAYS = 365;

    await runWeekAutoSubmit(NOW);

    const { where } = findMany.mock.calls[0][0];
    expect(where.periodEnd.gte).toEqual(new Date(NOW.getTime() - 8 * 7 * DAY_MS));
  });
});

describe('what the pass does with a candidate', () => {
  it('submits a complete week as the owning student, through submitEntry', async () => {
    findMany.mockResolvedValue([week('e1', 'student-1', 3)]);
    evaluate.mockResolvedValue(submittedOutcome);

    const out = await runWeekAutoSubmit(NOW);

    expect(out).toEqual({ submitted: 1, considered: 1 });
    // The state machine only allows `submit` from the owning student, and the
    // append-only event must record them — not a system actor.
    expect(evaluate).toHaveBeenCalledWith(
      { id: 'student-1', role: 'student' },
      'e1',
      submitEntry,
    );
  });

  it('leaves an incomplete week alone', async () => {
    findMany.mockResolvedValue([week('e1', 'student-1', 3)]);
    evaluate.mockResolvedValue(incompleteOutcome);

    const out = await runWeekAutoSubmit(NOW);

    // A half-written week is the student's to finish — pushing it at a
    // supervisor would be worse than the late mark it avoids.
    expect(out).toEqual({ submitted: 0, considered: 1 });
  });
});

describe('one bad week does not stop the cohort', () => {
  it('carries on after a failure and still submits the rest', async () => {
    findMany.mockResolvedValue([
      week('e1', 'student-1', 3),
      week('e2', 'student-2', 3),
      week('e3', 'student-3', 3),
    ]);
    evaluate
      .mockResolvedValueOnce(submittedOutcome)
      .mockRejectedValueOnce(new Error('row is locked'))
      .mockResolvedValueOnce(submittedOutcome);

    const out = await runWeekAutoSubmit(NOW);

    expect(out).toEqual({ submitted: 2, considered: 3 });
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('week auto-submit failed'),
      expect.objectContaining({ entryId: 'e2', err: 'row is locked' }),
    );
  });

  it('does not cry wolf when the API simply declines a week', async () => {
    // A sweep meeting a week the API refuses (too old, not started, already
    // moved on) is normal. Logging it at error would teach everyone to ignore
    // this job's errors, and the one that matters would go unread.
    findMany.mockResolvedValue([week('e1', 'student-1', 3), week('e2', 'student-2', 4)]);
    const declined = Object.assign(new Error('This week ended 40 days ago'), { statusCode: 422 });
    evaluate.mockRejectedValueOnce(declined).mockResolvedValueOnce(submittedOutcome);

    const out = await runWeekAutoSubmit(NOW);

    expect(out).toEqual({ submitted: 1, considered: 2 });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('declined'),
      expect.objectContaining({ entryId: 'e1', statusCode: 422 }),
    );
  });
});

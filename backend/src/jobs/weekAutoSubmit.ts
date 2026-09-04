import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { evaluateWeekCompletion } from '../modules/entries/entries.autosubmit';
import { submitEntry } from '../modules/entries/entries.service';
import { DAY_GRACE_DAYS } from '../modules/entries/entries.day.service';

/**
 * Safety net for a week the student finished but never submitted.
 *
 * When the last day of a week is saved, the logbook offers "submit now" or
 * "review first" rather than transitioning the week under them. This job is
 * what makes "review first" safe: a week whose working days are all accounted
 * for, still sitting in `draft` past its own grace window, is submitted on the
 * student's behalf so it is not counted late.
 *
 * It only ever touches COMPLETE weeks. A half-written week is the student's
 * problem to finish — pushing that at a supervisor would be worse than a late
 * mark. It also routes through `submitEntry`, so the state machine, the
 * append-only event and the supervisor notification behave exactly as they do
 * for a manual submit.
 */

const DAY_MS = 86_400_000;

/**
 * How long a finished week may sit unsent before the job sends it. Borrowed
 * from the per-DAY lateness grace deliberately — a student is told "you have
 * DAY_GRACE_DAYS" about their days, and a different number for their weeks
 * would be a second rule to learn. Named here so changing day grace later is a
 * decision about weeks too, not a silent side effect.
 */
const WEEK_SUBMIT_GRACE_DAYS = DAY_GRACE_DAYS;

/**
 * How far back to keep looking. A week abandoned two months ago is not
 * something a nightly pass should reconsider forever — without this the
 * candidate set grows without bound and each row costs several queries.
 */
const LOOKBACK_WEEKS = 8;

export async function runWeekAutoSubmit(now = new Date()): Promise<{ submitted: number; considered: number }> {
  // Only weeks whose grace window has already run out — inside it the student
  // is still on time and entitled to keep reviewing.
  const cutoff = new Date(now.getTime() - WEEK_SUBMIT_GRACE_DAYS * DAY_MS);

  // Never look back past the backfill cutoff when one is configured: submitEntry
  // rejects those weeks with a 422, so including them would mean this job logged
  // an error for every long-abandoned week, every night, for as long as it is
  // deployed. The scan stops where the API stops accepting.
  const lookbackDays = Math.min(
    LOOKBACK_WEEKS * 7,
    env.BACKFILL_CUTOFF_DAYS ?? Number.POSITIVE_INFINITY,
  );
  const lookback = new Date(now.getTime() - lookbackDays * DAY_MS);

  const candidates = await prisma.logbookEntry.findMany({
    where: { status: 'draft', periodEnd: { lt: cutoff, gte: lookback } },
    select: { id: true, studentId: true, weekNumber: true },
  });

  let submitted = 0;
  for (const week of candidates) {
    try {
      const outcome = await evaluateWeekCompletion(
        // Acting as the owning student: this is their submission, and the
        // state machine only allows `submit` from that role.
        { id: week.studentId, role: 'student' },
        week.id,
        submitEntry,
      );
      if (outcome.submitted) {
        submitted++;
        logger.info('CRON: auto-submitted a completed week past its grace window', {
          entryId: week.id, studentId: week.studentId, weekNumber: week.weekNumber,
        });
      }
    } catch (err) {
      // A week the API itself refuses (too old to backfill, week not started,
      // already moved on) is an expected outcome of a nightly sweep, not a
      // fault — logging it at error would train everyone to ignore this job's
      // errors. Anything else is real and stays loud.
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 422 || status === 409) {
        logger.debug('CRON: week auto-submit skipped an entry the API declined', {
          entryId: week.id, statusCode: status, err: (err as Error).message,
        });
        continue;
      }
      // One student's bad week must never stop the rest of the cohort.
      logger.error('CRON: week auto-submit failed for one entry', {
        entryId: week.id, err: (err as Error).message,
      });
    }
  }

  return { submitted, considered: candidates.length };
}

export function scheduleWeekAutoSubmit() {
  // 20:00 Ghana time daily — after the working day, before the night.
  cron.schedule('0 20 * * *', async () => {
    try {
      const { submitted, considered } = await runWeekAutoSubmit();
      if (submitted > 0) {
        logger.info('CRON: week auto-submit pass complete', { submitted, considered });
      }
    } catch (err) {
      logger.error('CRON: week auto-submit pass failed', { err });
    }
  }, { timezone: 'Africa/Accra' });
  logger.info('CRON: completed-week auto-submit scheduled (daily 20:00)');
}

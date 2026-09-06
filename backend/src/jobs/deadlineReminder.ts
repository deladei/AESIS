import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { sendEmail } from '../shared/utils/email';
import { emitToUser } from '../shared/utils/socketEmitter';
import { createNotification } from '../modules/notifications/notifications.service';
import { todayUtc } from '../modules/entries/entry.dates';

/**
 * Nudges a student whose week is about to close and is still unsent.
 *
 * This used to read `logbook_submission` and key off a stored `deadline`
 * column. That table is dead — the live week is `logbook_entry` — so the job
 * matched zero rows and silently sent nothing. There is no `deadline` column on
 * the live model either, and there does not need to be: a week's deadline IS
 * its `periodEnd`, and every week carries its own, so the reminder no longer
 * assumes the whole cohort shares a Friday.
 *
 * It therefore runs DAILY and works out who is 48 h or 24 h out from their own
 * week end, rather than firing on two fixed weekdays.
 */

const DAY_MS = 86_400_000;

/** How many days ahead of a week's own `periodEnd` each reminder goes out. */
const REMINDER_OFFSETS = { 2: 48, 1: 24 } as const;

type Hours = (typeof REMINDER_OFFSETS)[keyof typeof REMINDER_OFFSETS];

/** A UTC-midnight date `days` after today — the shape `periodEnd` is stored in. */
function utcDateIn(days: number, from: Date): Date {
  const base = new Date(`${from.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(base.getTime() + days * DAY_MS);
}

export async function runDeadlineReminder(now = todayUtc()): Promise<{ reminded: number }> {
  const dueIn2 = utcDateIn(2, now);
  const dueIn1 = utcDateIn(1, now);

  // One query for both windows; the row's own periodEnd says which reminder it
  // is owed, so a week ending on any weekday is handled.
  const weeks = await prisma.logbookEntry.findMany({
    where: {
      // `returned` is the modern "flagged": the supervisor sent it back and it
      // still has to come in. `submitted`/`acknowledged` are done with.
      status:    { in: ['draft', 'returned'] },
      periodEnd: { in: [dueIn1, dueIn2] },
      // A withdrawn or completed placement must not nag anybody.
      placement: { is: { placementStatus: 'active' } },
    },
    select: {
      weekNumber: true,
      periodEnd:  true,
      studentId:  true,
      student:    { select: { email: true, firstName: true } },
    },
  });

  let reminded = 0;

  for (const week of weeks) {
    const daysOut = Math.round((week.periodEnd.getTime() - now.getTime()) / DAY_MS);
    const hours = REMINDER_OFFSETS[daysOut as 1 | 2] as Hours | undefined;
    if (!hours) continue; // defensive: the query already narrows to 1 or 2

    const { studentId, student, weekNumber } = week;
    const urgency = hours === 24 ? 'Urgent: ' : '';

    try {
      const notification = await createNotification({
        userId: studentId,
        type:   'submission_reminder',
        title:  `${urgency}Week ${weekNumber} logbook closes in ${hours} hours`,
        body:   `Your Week ${weekNumber} logbook is due in ${hours} hours. Submit before it closes to avoid a late mark.`,
        link:   `/student/logbook?week=${weekNumber}`,
        metadata: { weekNumber, hoursUntilDeadline: hours },
      });

      emitToUser(studentId, 'notification:new', {
        id:        notification.id,
        type:      notification.type,
        title:     notification.title,
        body:      notification.body,
        link:      notification.link,
        createdAt: notification.createdAt,
      });

      await sendEmail({
        to:      student.email,
        subject: `${urgency}Logbook Week ${weekNumber} due in ${hours}h`,
        html:    `<p>Hi ${student.firstName},</p>
                  <p>Your <strong>Week ${weekNumber}</strong> logbook is due in
                  <strong>${hours} hours</strong>.</p>
                  <p>Please submit before it closes to avoid a late submission mark.</p>`,
      });

      reminded++;
    } catch (err) {
      // One student's failed email must not cost the rest of the cohort theirs.
      logger.error('CRON: deadline reminder failed for one student', {
        studentId, weekNumber, err: (err as Error).message,
      });
    }
  }

  return { reminded };
}

export function startDeadlineReminderJobs(): void {
  // 09:00 Ghana time, daily. Was Wed+Thu on Africa/Lagos — the wrong timezone
  // for a Ghanaian programme, and the wrong cadence now that each week carries
  // its own end date.
  cron.schedule('0 9 * * *', async () => {
    try {
      const { reminded } = await runDeadlineReminder();
      logger.info('CRON: deadline reminder pass complete', { reminded });
    } catch (err) {
      logger.error('CRON: deadline reminder failed', { err });
    }
  }, { timezone: 'Africa/Accra' });
  logger.info('CRON: deadline reminder job scheduled (daily 09:00)');
}

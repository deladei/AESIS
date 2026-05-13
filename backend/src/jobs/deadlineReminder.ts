import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { sendEmail } from '../shared/utils/email';
import { emitToUser } from '../shared/utils/socketEmitter';
import { createNotification } from '../modules/notifications/notifications.service';

/**
 * Fires Wed 09:00 (48 h before Friday deadline) and Thu 09:00 (24 h).
 * Finds logbook submissions that are still in 'draft' or 'flagged' / not yet
 * submitted for the current week, then notifies the student via DB notification,
 * socket event, and email.
 */
async function runDeadlineReminder(hoursUntilDeadline: 48 | 24) {
  logger.info(`CRON: deadline reminder — ${hoursUntilDeadline}h before deadline`);

  try {
    const now    = new Date();
    const friday = getNextFriday(now);
    const from   = new Date(friday);
    from.setHours(0, 0, 0, 0);
    const to     = new Date(friday);
    to.setHours(23, 59, 59, 999);

    // Find submissions whose deadline falls this Friday and are not yet submitted
    const submissions = await prisma.logbookSubmission.findMany({
      where: {
        deadline:         { gte: from, lte: to },
        submissionStatus: { notIn: ['submitted', 'approved', 'under_review'] },
      },
      select: {
        weekNumber: true,
        studentId:  true,
        student:    { select: { email: true, firstName: true } },
      },
    });

    logger.info(`CRON: ${submissions.length} students need ${hoursUntilDeadline}h reminder`);

    for (const submission of submissions) {
      const { studentId, student } = submission;
      const urgency = hoursUntilDeadline === 24 ? '⚠️ URGENT: ' : '';

      const notification = await createNotification({
        userId: studentId,
        type:   'submission_reminder',
        title:  `${urgency}Week ${submission.weekNumber} logbook due Friday`,
        body:   `Your Week ${submission.weekNumber} logbook is due in ${hoursUntilDeadline} hours. Submit before the deadline to avoid a late penalty.`,
        link:   `/logbook/week/${submission.weekNumber}`,
        metadata: { weekNumber: submission.weekNumber, hoursUntilDeadline },
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
        subject: `${urgency}Logbook Week ${submission.weekNumber} due in ${hoursUntilDeadline}h`,
        html:    `<p>Hi ${student.firstName},</p>
                  <p>Your <strong>Week ${submission.weekNumber}</strong> logbook submission is due in
                  <strong>${hoursUntilDeadline} hours</strong> (this Friday).</p>
                  <p>Please submit before the deadline to avoid a late submission mark.</p>`,
      });
    }
  } catch (err) {
    logger.error('CRON: deadline reminder failed', { err });
  }
}

export function startDeadlineReminderJobs(): void {
  // Wed 09:00 — 48 h reminder
  cron.schedule('0 9 * * 3', () => runDeadlineReminder(48), { timezone: 'Africa/Lagos' });
  // Thu 09:00 — 24 h reminder
  cron.schedule('0 9 * * 4', () => runDeadlineReminder(24), { timezone: 'Africa/Lagos' });
  logger.info('CRON: deadline reminder jobs scheduled (Wed 09:00 + Thu 09:00)');
}

// ── Helper ────────────────────────────────────────────────────

function getNextFriday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();          // 0=Sun … 5=Fri … 6=Sat
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

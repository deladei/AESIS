import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { sendEmail } from '../shared/utils/email';
import { refreshRiskSnapshots, latestRiskDistribution } from '../modules/risk/risk.service';

/**
 * Fires every Monday 08:00.
 * Sends coordinators a weekly compliance report:
 *   - Total active placements
 *   - Submission compliance rate for last week
 *   - Number of high-risk students (risk tier = high)
 */
async function runWeeklyReport() {
  logger.info('CRON: weekly coordinator report starting');

  try {
    const coordinators = await prisma.user.findMany({
      where: { role: 'coordinator', isVerified: true },
      select: { id: true, email: true, firstName: true },
    });

    if (coordinators.length === 0) {
      logger.info('CRON: no active coordinators — skipping weekly report');
      return;
    }

    // Last week window
    const now        = new Date();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - 7);
    lastMonday.setHours(0, 0, 0, 0);
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - 1);
    lastSunday.setHours(23, 59, 59, 999);

    // Recompute snapshots so the count below reflects current tiers, not the
    // last dashboard load. Never throws.
    await refreshRiskSnapshots();

    const [activePlacements, submittedLastWeek, totalScheduledLastWeek, riskDistribution] =
      await Promise.all([
        prisma.placement.count({ where: { placementStatus: 'active' } }),
        // Submissions submitted last week
        prisma.logbookSubmission.count({
          where: {
            submittedAt:      { gte: lastMonday, lte: lastSunday },
            submissionStatus: { in: ['submitted', 'approved', 'under_review'] },
          },
        }),
        // Submissions whose deadline fell last week (total scheduled)
        prisma.logbookSubmission.count({
          where: { deadline: { gte: lastMonday, lte: lastSunday } },
        }),
        // Latest tier per active placement (the risk table is a movement
        // history — a raw count would include superseded high rows).
        latestRiskDistribution({ placementStatus: 'active' }),
      ]);
    const highRiskCount = riskDistribution.high;

    const complianceRate = totalScheduledLastWeek > 0
      ? Math.round((submittedLastWeek / totalScheduledLastWeek) * 100)
      : 100;

    const weekStr = `${lastMonday.toDateString()} – ${lastSunday.toDateString()}`;

    for (const coordinator of coordinators) {
      await sendEmail({
        to:      coordinator.email,
        subject: `AESIS Weekly Report — ${weekStr}`,
        html: `
          <h2>AESIS Weekly Internship Report</h2>
          <p>Hi ${coordinator.firstName},</p>
          <p>Here is the internship cohort summary for <strong>${weekStr}</strong>:</p>
          <table style="border-collapse:collapse;width:100%;max-width:480px">
            <tr>
              <td style="padding:8px;border:1px solid #ddd">Active placements</td>
              <td style="padding:8px;border:1px solid #ddd"><strong>${activePlacements}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd">Logbook compliance (last week)</td>
              <td style="padding:8px;border:1px solid #ddd">
                <strong style="color:${complianceRate >= 80 ? 'green' : complianceRate >= 60 ? 'orange' : 'red'}">
                  ${complianceRate}%
                </strong>
                (${submittedLastWeek} / ${totalScheduledLastWeek} submissions)
              </td>
            </tr>
            <tr>
              <td style="padding:8px;border:1px solid #ddd">High-risk students</td>
              <td style="padding:8px;border:1px solid #ddd">
                <strong style="color:${highRiskCount > 0 ? 'red' : 'green'}">${highRiskCount}</strong>
              </td>
            </tr>
          </table>
          <p style="margin-top:16px">
            ${highRiskCount > 0
              ? `<strong>⚠️ Action required:</strong> ${highRiskCount} student(s) flagged as high risk. Please review in the coordinator dashboard.`
              : '✅ No high-risk students this week.'}
          </p>
        `,
      });
      logger.info('CRON: weekly report sent', { coordinatorId: coordinator.id });
    }
  } catch (err) {
    logger.error('CRON: weekly report failed', { err });
  }
}

export function startWeeklyReportJob(): void {
  cron.schedule('0 8 * * 1', runWeeklyReport, { timezone: 'Africa/Lagos' });
  logger.info('CRON: weekly coordinator report scheduled (Mon 08:00)');
}

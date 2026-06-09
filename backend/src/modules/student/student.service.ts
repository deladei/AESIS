import { prisma } from '../../config/prisma';
import { meanQualityScore, weekProgress } from '../../shared/utils/quality';

// Statuses that count as a submitted logbook for completion progress.
const SUBMITTED_STATUSES = ['submitted', 'approved', 'under_review'];

/**
 * Stats for the intern (student) dashboard.
 *
 * Computed server-side so the average is always a validated numeric mean and
 * the week count is always derived from the placement's real dates — neither a
 * string-concatenated score nor an out-of-range aggregate can reach the UI.
 */
export async function getStudentDashboard(studentId: string) {
  const placements = await prisma.placement.findMany({
    where:   { studentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:              true,
      startDate:       true,
      endDate:         true,
      placementStatus: true,
      academicYear: {
        select: { cohortConfigs: { select: { totalWeeks: true }, take: 1 } },
      },
      logbookSubmissions: {
        select: {
          submissionStatus: true,
          analysis: { select: { qualityScore: true } },
        },
      },
    },
  });

  // Prefer the active placement, else the most recent — same rule the UI uses.
  const placement =
    placements.find(p => p.placementStatus === 'active') ?? placements[0];

  if (!placement) {
    return {
      hasActivePlacement: false,
      week:               null,
      logsSubmitted:      0,
      expectedLogs:       0,
      completionPct:      0,
      avgQualityScore:    null,
    };
  }

  const subs        = placement.logbookSubmissions;
  const submitted   = subs.filter(s => SUBMITTED_STATUSES.includes(s.submissionStatus));
  const avgQualityScore = meanQualityScore(subs.map(s => s.analysis?.qualityScore));

  const week = weekProgress({
    startDate:        placement.startDate,
    endDate:          placement.endDate,
    totalWeeksConfig: placement.academicYear?.cohortConfigs?.[0]?.totalWeeks ?? null,
    submittedCount:   submitted.length,
  });

  const completionPct = week.total > 0
    ? Math.min(100, Math.round((submitted.length / week.total) * 100))
    : 0;

  return {
    hasActivePlacement: placement.placementStatus === 'active',
    week,                              // { current, total }
    logsSubmitted:   submitted.length,
    expectedLogs:    week.total,
    completionPct,
    avgQualityScore,                   // number (1 dp) within [0, 100], or null
  };
}

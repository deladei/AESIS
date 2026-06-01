import { prisma } from '../../config/prisma';
import type { SubmissionStatus } from '@prisma/client';

// A submission "counts as submitted" once it leaves draft — mirrors the
// coordinator dashboard's engagement definition for cross-dashboard consistency.
const SUBMITTED: SubmissionStatus[] = ['submitted', 'under_review', 'approved'];
const PENDING:   SubmissionStatus[] = ['submitted', 'under_review'];
const REVIEWED:  SubmissionStatus[] = ['approved', 'flagged'];

const PULSE_LIMIT  = 6;
const RECENT_LIMIT = 6;

/**
 * System-wide rollup for the Admin "Supervisor Overview" dashboard.
 * Admin sees all placements (no per-supervisor scoping).
 */
export async function getAdminDashboard() {
  const [
    activeInterns,
    totalScheduled,
    totalSubmitted,
    pendingReviews,
    reviewedCount,
    activePlacements,
    recentRows,
  ] = await Promise.all([
    prisma.placement.count({ where: { placementStatus: 'active' } }),
    prisma.logbookSubmission.count({ where: { placement: { placementStatus: 'active' } } }),
    prisma.logbookSubmission.count({
      where: { placement: { placementStatus: 'active' }, submissionStatus: { in: SUBMITTED } },
    }),
    prisma.logbookSubmission.count({ where: { submissionStatus: { in: PENDING } } }),
    prisma.logbookSubmission.count({ where: { submissionStatus: { in: REVIEWED } } }),
    prisma.placement.findMany({
      where:  { placementStatus: 'active' },
      select: {
        id:      true,
        student: {
          select: {
            firstName: true, lastName: true,
            programme: { select: { name: true } },
          },
        },
        riskScores: { orderBy: { computedAt: 'desc' }, take: 1, select: { riskTier: true } },
        _count:     { select: { logbookSubmissions: true } },
      },
    }),
    prisma.logbookSubmission.findMany({
      where:   { submittedAt: { not: null }, submissionStatus: { in: SUBMITTED } },
      orderBy: { submittedAt: 'desc' },
      take:    RECENT_LIMIT,
      select:  {
        id: true, weekNumber: true, submittedAt: true, submissionStatus: true,
        student: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const avgEngagement = totalScheduled > 0
    ? Math.round((totalSubmitted / totalScheduled) * 100)
    : 100;

  // Submitted-week counts per active placement, in one grouped query.
  const placementIds = activePlacements.map(p => p.id);
  const submittedByPlacement = placementIds.length
    ? await prisma.logbookSubmission.groupBy({
        by:     ['placementId'],
        _count: { _all: true },
        where:  { placementId: { in: placementIds }, submissionStatus: { in: SUBMITTED } },
      })
    : [];
  const submittedMap = new Map(submittedByPlacement.map(r => [r.placementId, r._count._all]));

  const ranked = activePlacements.map(p => {
    const totalWeeks     = p._count.logbookSubmissions;
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    return {
      placementId:   p.id,
      name:          `${p.student.firstName} ${p.student.lastName}`,
      department:    p.student.programme?.name ?? null,
      riskTier:      p.riskScores[0]?.riskTier ?? null,
      submittedWeeks,
      totalWeeks,
      engagementPct: totalWeeks > 0 ? Math.round((submittedWeeks / totalWeeks) * 100) : 0,
      feedbackCount: 0,
    };
  }).sort((a, b) => b.engagementPct - a.engagementPct);

  const pulseBoard = ranked.slice(0, PULSE_LIMIT);

  // Feedback counts for just the surfaced interns — one query, tallied in JS.
  const topIds = pulseBoard.map(p => p.placementId);
  if (topIds.length) {
    const fbRows = await prisma.supervisorFeedback.findMany({
      where:  { submission: { placementId: { in: topIds } } },
      select: { submission: { select: { placementId: true } } },
    });
    const fbMap = new Map<string, number>();
    for (const r of fbRows) {
      const pid = r.submission.placementId;
      fbMap.set(pid, (fbMap.get(pid) ?? 0) + 1);
    }
    for (const p of pulseBoard) p.feedbackCount = fbMap.get(p.placementId) ?? 0;
  }

  const recentSubmissions = recentRows.map(s => ({
    id:          s.id,
    internName:  `${s.student.firstName} ${s.student.lastName}`,
    weekNumber:  s.weekNumber,
    submittedAt: s.submittedAt,
    status:      s.submissionStatus,
  }));

  return {
    overview:          { activeInterns, pendingReviews, avgEngagement },
    pulseBoard,
    recentSubmissions,
    submissionCounts:  { pending: pendingReviews, reviewed: reviewedCount },
  };
}

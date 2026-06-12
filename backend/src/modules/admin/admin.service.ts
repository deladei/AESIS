import { prisma } from '../../config/prisma';
import { SYSTEM_MAX_WEEKS } from '../../shared/utils/quality';

// Engagement is measured off the active weekly-entry pipeline. A week "counts as
// submitted" once its entry has actually been submitted (submittedAt set);
// "pending" is awaiting supervisor action, "reviewed" is acted on.
const REVIEWED_ENTRY_STATUSES = ['acknowledged', 'returned', 'rejected'] as const;

const PULSE_LIMIT  = 6;
const RECENT_LIMIT = 6;

/**
 * System-wide rollup for the Admin "Supervisor Overview" dashboard.
 * Admin sees all placements (no per-supervisor scoping).
 */
export async function getAdminDashboard() {
  const [
    activeInterns,
    totalSubmitted,
    pendingReviews,
    reviewedCount,
    activePlacements,
    recentRows,
  ] = await Promise.all([
    prisma.placement.count({ where: { placementStatus: 'active' } }),
    prisma.logbookEntry.count({
      where: { placement: { placementStatus: 'active' }, submittedAt: { not: null } },
    }),
    prisma.logbookEntry.count({ where: { status: 'submitted' } }),
    prisma.logbookEntry.count({ where: { status: { in: [...REVIEWED_ENTRY_STATUSES] } } }),
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
      },
    }),
    prisma.logbookEntry.findMany({
      where:   { submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take:    RECENT_LIMIT,
      select:  {
        id: true, weekNumber: true, submittedAt: true, status: true,
        placement: { select: { student: { select: { firstName: true, lastName: true } } } },
      },
    }),
  ]);

  // Every active intern is on the fixed 6-week programme, so the scheduled total
  // is interns × 6 — never a count of pre-seeded rows.
  const totalScheduled = activeInterns * SYSTEM_MAX_WEEKS;
  const avgEngagement = totalScheduled > 0
    ? Math.round((totalSubmitted / totalScheduled) * 100)
    : 100;

  // Submitted-week counts per active placement, in one grouped query.
  const placementIds = activePlacements.map(p => p.id);
  const submittedByPlacement = placementIds.length
    ? await prisma.logbookEntry.groupBy({
        by:     ['placementId'],
        _count: { _all: true },
        where:  { placementId: { in: placementIds }, submittedAt: { not: null } },
      })
    : [];
  const submittedMap = new Map(submittedByPlacement.map(r => [r.placementId, r._count._all]));

  const ranked = activePlacements.map(p => {
    const totalWeeks     = SYSTEM_MAX_WEEKS;
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
    internName:  `${s.placement.student.firstName} ${s.placement.student.lastName}`,
    weekNumber:  s.weekNumber,
    submittedAt: s.submittedAt,
    status:      s.status,
  }));

  return {
    overview:          { activeInterns, pendingReviews, avgEngagement },
    pulseBoard,
    recentSubmissions,
    submissionCounts:  { pending: pendingReviews, reviewed: reviewedCount },
  };
}

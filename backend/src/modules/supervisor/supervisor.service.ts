import { prisma } from '../../config/prisma';
import { refreshRiskSnapshots } from '../risk/risk.service';
import { meanQualityScore, mergedQualityScores } from '../../shared/utils/quality';

export async function getSupervisorDashboard(supervisorId: string) {
  // Bring risk tiers up to date before reading them (never throws).
  await refreshRiskSnapshots(supervisorId);

  const [placements, pendingReview] = await Promise.all([
    prisma.placement.findMany({
      where: {
        academicSupervisorId: supervisorId,
        placementStatus:      'active',
      },
      select: {
        id:      true,
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        riskScores: {
          orderBy: { computedAt: 'desc' },
          take:    1,
          select:  { riskTier: true, riskScore: true, topRiskFactors: true },
        },
        logbookSubmissions: {
          orderBy: { weekNumber: 'desc' },
          take:    4,
          select: {
            weekNumber:       true,
            submissionStatus: true,
            submittedAt:      true,
            analysis: { select: { qualityScore: true } },
          },
        },
        // v2 pipeline: recent weekly entries' latest ai_assessment carries the
        // quality signal now that the legacy analysis writer is retired (S82).
        logbookEntries: {
          orderBy: { weekNumber: 'desc' },
          take:    4,
          select: {
            assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    }),
    // The ACTIVE pipeline. This counted `logbook_submissions`, which has had no
    // writer since the consolidation — so "Pending Reviews" read 0 in
    // production however many weeks were actually waiting on the supervisor.
    prisma.logbookEntry.count({
      where: {
        placement: {
          academicSupervisorId: supervisorId,
          placementStatus:      'active',
        },
        status: 'submitted',
      },
    }),
  ]);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [reportsThisMonth, completedInternships, upcomingReviews, pendingApprovals] = await Promise.all([
    prisma.logbookEntry.count({
      where: {
        placement: { academicSupervisorId: supervisorId },
        submittedAt: { gte: monthStart },
      },
    }),
    prisma.placement.count({
      where: { academicSupervisorId: supervisorId, finalizationStatus: 'finalized' },
    }),
    prisma.visitSchedule.findMany({
      where: {
        supervisorId,
        cancelledAt: null,
        completed: false,
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      select: {
        id: true, scheduledAt: true, visitType: true, durationMinutes: true, location: true,
        placement: {
          select: {
            id: true,
            student: { select: { firstName: true, lastName: true } },
            company: { select: { name: true } },
          },
        },
      },
    }),
    prisma.approvalRequest.count({
      where: { status: 'requested', placement: { academicSupervisorId: supervisorId } },
    }),
  ]);

  const students = placements.map(p => {
    // Reverse so oldest-first for sparkline (front-end Recharts)
    const recent = [...p.logbookSubmissions].reverse();

    // Validated mean over both sources: recent legacy submissions (frozen
    // history) + recent v2 entry assessments.
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      recent.map(s => s.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));

    return {
      placementId: p.id,
      student:     p.student,
      riskTier:    p.riskScores[0]?.riskTier  ?? null,
      riskScore:   p.riskScores[0]?.riskScore != null
                     ? Number(p.riskScores[0].riskScore) : null,
      riskFactors: p.riskScores[0]?.topRiskFactors ?? [],
      recentWeeks: recent.map(s => ({
        week:   s.weekNumber,
        status: s.submissionStatus,
        score:  s.analysis?.qualityScore != null ? Number(s.analysis.qualityScore) : null,
      })),
      avgQualityScore,
      lastSubmittedAt: p.logbookSubmissions[0]?.submittedAt ?? null,
    };
  });

  const allAvgScores = students
    .map(s => s.avgQualityScore)
    .filter((v): v is number => v !== null);

  const avgQualityScore = allAvgScores.length
    ? Math.round(allAvgScores.reduce((a, b) => a + b, 0) / allAvgScores.length * 10) / 10
    : null;

  // The next scheduled review per placement, so the student list can carry a
  // "Next review" column without a query per row.
  const nextReviewByPlacement: Record<string, string> = {};
  for (const v of upcomingReviews) {
    if (!nextReviewByPlacement[v.placement.id]) {
      nextReviewByPlacement[v.placement.id] = v.scheduledAt.toISOString();
    }
  }

  return {
    overview: {
      assignedStudents: placements.length,
      pendingReview,
      avgQualityScore,
      reportsThisMonth,
      completedInternships,
      pendingApprovals,
    },
    upcomingReviews: upcomingReviews.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt,
      visitType: v.visitType,
      durationMinutes: v.durationMinutes,
      location: v.location,
      placementId: v.placement.id,
      student: `${v.placement.student.firstName} ${v.placement.student.lastName}`,
      company: v.placement.company?.name ?? null,
    })),
    students: students.map((s) => ({
      ...s,
      nextReviewAt: nextReviewByPlacement[s.placementId] ?? null,
    })),
  };
}

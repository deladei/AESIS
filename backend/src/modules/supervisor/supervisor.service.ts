import { prisma } from '../../config/prisma';
import { refreshRiskSnapshots } from '../risk/risk.service';

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
      },
    }),
    prisma.logbookSubmission.count({
      where: {
        placement: {
          academicSupervisorId: supervisorId,
          placementStatus:      'active',
        },
        submissionStatus: { in: ['submitted', 'under_review'] },
      },
    }),
  ]);

  const students = placements.map(p => {
    // Reverse so oldest-first for sparkline (front-end Recharts)
    const recent = [...p.logbookSubmissions].reverse();

    const qualityScores = recent
      .map(s => s.analysis?.qualityScore != null ? Number(s.analysis.qualityScore) : null)
      .filter((v): v is number => v !== null);

    const avgQualityScore = qualityScores.length
      ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length * 10) / 10
      : null;

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

  return {
    overview: {
      assignedStudents: placements.length,
      pendingReview,
      avgQualityScore,
    },
    students,
  };
}

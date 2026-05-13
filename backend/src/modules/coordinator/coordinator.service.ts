import { prisma } from '../../config/prisma';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import type { RiskTier } from '@prisma/client';

// ── Dashboard ─────────────────────────────────────────────────

export async function getCoordinatorDashboard() {
  const [
    activePlacements,
    pendingApprovals,
    riskRows,
    scheduledByWeek,
  ] = await Promise.all([
    prisma.placement.count({ where: { placementStatus: 'active' } }),
    prisma.placement.count({ where: { placementStatus: 'pending' } }),
    // Latest risk score per active placement — group by tier
    prisma.studentRiskScore.groupBy({
      by:    ['riskTier'],
      _count: { _all: true },
      where: { placement: { placementStatus: 'active' } },
    }),
    // All submissions for active placements — grouped by week
    prisma.logbookSubmission.groupBy({
      by:      ['weekNumber'],
      _count:  { _all: true },
      where:   { placement: { placementStatus: 'active' } },
      orderBy: { weekNumber: 'asc' },
    }),
  ]);

  const submittedByWeek = await prisma.logbookSubmission.groupBy({
    by:      ['weekNumber'],
    _count:  { _all: true },
    where: {
      placement:        { placementStatus: 'active' },
      submissionStatus: { in: ['submitted', 'approved', 'under_review'] },
    },
    orderBy: { weekNumber: 'asc' },
  });

  // Risk distribution map
  const riskDistribution: Record<RiskTier, number> = { low: 0, medium: 0, high: 0 };
  for (const row of riskRows) {
    riskDistribution[row.riskTier] = row._count._all;
  }

  // Overall compliance rate
  const totalScheduled = scheduledByWeek.reduce((s, r) => s + r._count._all, 0);
  const totalSubmitted = submittedByWeek.reduce((s, r) => s + r._count._all, 0);
  const complianceRate = totalScheduled > 0
    ? Math.round((totalSubmitted / totalScheduled) * 100)
    : 100;

  // Per-week trend
  const submittedMap = new Map(submittedByWeek.map(r => [r.weekNumber, r._count._all]));
  const submissionTrends = scheduledByWeek.map(r => ({
    week:      r.weekNumber,
    scheduled: r._count._all,
    submitted: submittedMap.get(r.weekNumber) ?? 0,
  }));

  return {
    overview: {
      activePlacements,
      pendingApprovals,
      complianceRate,
      highRiskCount: riskDistribution.high,
    },
    riskDistribution,
    submissionTrends,
  };
}

// ── Student list ──────────────────────────────────────────────

export interface StudentListFilters {
  page:      number;
  limit:     number;
  riskTier?: RiskTier;
}

export async function listStudents(filters: StudentListFilters) {
  const { page, limit, riskTier } = filters;
  const { skip, take } = paginate(page, limit);

  const where = {
    placementStatus: 'active' as const,
    ...(riskTier ? { riskScores: { some: { riskTier } } } : {}),
  };

  const [placements, total] = await Promise.all([
    prisma.placement.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id:      true,
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        riskScores: {
          orderBy: { computedAt: 'desc' },
          take:    1,
          select:  { riskTier: true, riskScore: true, computedAt: true },
        },
        logbookSubmissions: {
          orderBy: { weekNumber: 'desc' },
          take:    1,
          select:  { weekNumber: true, submissionStatus: true, submittedAt: true },
        },
      },
    }),
    prisma.placement.count({ where }),
  ]);

  const students = placements.map(p => ({
    placementId:    p.id,
    student:        p.student,
    riskTier:       p.riskScores[0]?.riskTier       ?? null,
    riskScore:      p.riskScores[0]?.riskScore != null
                      ? Number(p.riskScores[0].riskScore) : null,
    lastWeek:       p.logbookSubmissions[0]?.weekNumber    ?? null,
    lastStatus:     p.logbookSubmissions[0]?.submissionStatus ?? null,
    lastSubmittedAt: p.logbookSubmissions[0]?.submittedAt  ?? null,
  }));

  return { students, meta: buildMeta(total, page, limit) };
}

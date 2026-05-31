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
    qualityAgg,
    partnerCompanyRows,
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
    // Cohort-wide average logbook quality score (active placements only)
    prisma.logbookAnalysis.aggregate({
      _avg:  { qualityScore: true },
      where: { submission: { placement: { placementStatus: 'active' } } },
    }),
    // Distinct companies hosting at least one active placement
    prisma.placement.findMany({
      where:    { placementStatus: 'active', companyId: { not: null } },
      select:   { companyId: true },
      distinct: ['companyId'],
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

  // Cohort average performance (quality) — null when no analyses exist yet
  const avgPerformance = qualityAgg._avg.qualityScore != null
    ? Math.round(Number(qualityAgg._avg.qualityScore) * 10) / 10
    : null;

  return {
    overview: {
      activePlacements,
      pendingApprovals,
      complianceRate,
      highRiskCount:    riskDistribution.high,
      avgPerformance,
      partnerCompanies: partnerCompanyRows.length,
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
        student: {
          select: {
            id: true, firstName: true, lastName: true, email: true,
            programme: { select: { name: true } },
          },
        },
        academicSupervisor: { select: { id: true, firstName: true, lastName: true } },
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
        // Total scheduled weeks for this placement (the 24-week schedule)
        _count: { select: { logbookSubmissions: true } },
      },
    }),
    prisma.placement.count({ where }),
  ]);

  // Submitted-week counts per placement, in one grouped query, for progress %
  const placementIds = placements.map(p => p.id);
  const submittedCounts = placementIds.length
    ? await prisma.logbookSubmission.groupBy({
        by:     ['placementId'],
        _count: { _all: true },
        where:  {
          placementId:      { in: placementIds },
          submissionStatus: { in: ['submitted', 'approved', 'under_review'] },
        },
      })
    : [];
  const submittedMap = new Map(submittedCounts.map(r => [r.placementId, r._count._all]));

  const students = placements.map(p => {
    const totalWeeks     = p._count.logbookSubmissions;
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    const sup            = p.academicSupervisor;
    return {
      placementId:    p.id,
      student:        {
        id: p.student.id, firstName: p.student.firstName,
        lastName: p.student.lastName, email: p.student.email,
      },
      department:     p.student.programme?.name ?? null,
      supervisor:     sup ? { id: sup.id, name: `${sup.firstName} ${sup.lastName}` } : null,
      riskTier:       p.riskScores[0]?.riskTier       ?? null,
      riskScore:      p.riskScores[0]?.riskScore != null
                        ? Number(p.riskScores[0].riskScore) : null,
      lastWeek:       p.logbookSubmissions[0]?.weekNumber    ?? null,
      lastStatus:     p.logbookSubmissions[0]?.submissionStatus ?? null,
      lastSubmittedAt: p.logbookSubmissions[0]?.submittedAt  ?? null,
      totalWeeks,
      submittedWeeks,
      progressPct:    totalWeeks > 0 ? Math.round((submittedWeeks / totalWeeks) * 100) : 0,
    };
  });

  return { students, meta: buildMeta(total, page, limit) };
}

// ── Recent activity feed ──────────────────────────────────────

/** Human-readable summary for an audit-log row, from action + metadata. */
function summarizeAudit(action: string, metadata: unknown): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  switch (action) {
    case 'placement_status_change':
      return meta.change === 'supervisor_assigned'
        ? 'Assigned an academic supervisor to a placement'
        : `Changed a placement status${meta.status ? ` to "${meta.status}"` : ''}`;
    case 'role_change':       return 'Changed a user role';
    case 'data_export':       return 'Exported data';
    case 'ai_override':       return 'Overrode an AI assessment';
    case 'escalation_created':  return 'Raised an escalation';
    case 'escalation_resolved': return 'Resolved an escalation';
    case 'logbook_override':  return 'Overrode a logbook entry';
    default:                  return action.replace(/_/g, ' ');
  }
}

export async function getRecentActivity(limit = 8) {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take:    limit,
    select: {
      id: true, action: true, entityType: true, entityId: true,
      metadata: true, createdAt: true,
      user: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  return logs.map(l => ({
    id:         l.id,
    action:     l.action,
    entityType: l.entityType,
    actor:      `${l.user.firstName} ${l.user.lastName}`,
    actorRole:  l.user.role,
    summary:    summarizeAudit(l.action, l.metadata),
    createdAt:  l.createdAt,
  }));
}

// ── Supervisors (for assignment dropdowns) ────────────────────

export async function listSupervisors() {
  return prisma.user.findMany({
    where:   { role: 'academic_supervisor' },
    select:  { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

import { prisma } from '../../config/prisma';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { meanQualityScore } from '../../shared/utils/quality';
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

// ── Oversight view (cross-cohort at-risk monitoring) ──────────
// Read-only across ALL active placements (coordinator/admin). Computes three
// at-risk flags per intern from real data — never a raw/ambiguous value:
//   • overdueLogs        — draft weekly entries whose period has already ended.
//   • lowAvgScore        — validated mean logbook quality score below threshold.
//   • noSupervisorFeedback — no written feedback AND no acknowledged week.

const LOW_AVG_THRESHOLD = 50;

export async function getOversight(now: Date = new Date()) {
  const placements = await prisma.placement.findMany({
    where:   { placementStatus: 'active' },
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
      riskScores: { orderBy: { computedAt: 'desc' }, take: 1, select: { riskTier: true } },
      // Active weekly pipeline — drives overdue + activity.
      logbookEntries: { select: { status: true, periodEnd: true, submittedAt: true, updatedAt: true } },
      // Legacy submissions carry the quality scores + written feedback.
      logbookSubmissions: {
        select: {
          submittedAt: true,
          analysis:    { select: { qualityScore: true } },
          feedback:    { select: { submittedAt: true } },
        },
      },
    },
  });

  const rows = placements.map((p) => {
    const overdueLogs = p.logbookEntries.filter(
      (e) => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now,
    ).length;

    // Validated numeric mean — null (→ "—") when nothing scorable, never 0.
    const avgQualityScore = meanQualityScore(
      p.logbookSubmissions.map((s) => s.analysis?.qualityScore ?? null),
    );
    const lowAvgScore = avgQualityScore !== null && avgQualityScore < LOW_AVG_THRESHOLD;

    const feedbackCount     = p.logbookSubmissions.reduce((n, s) => n + s.feedback.length, 0);
    const acknowledgedCount = p.logbookEntries.filter((e) => e.status === 'acknowledged').length;
    const noSupervisorFeedback = feedbackCount === 0 && acknowledgedCount === 0;

    // Latest student/supervisor action across both pipelines.
    const stamps: number[] = [];
    for (const e of p.logbookEntries) {
      if (e.submittedAt) stamps.push(new Date(e.submittedAt).getTime());
      if (e.updatedAt)   stamps.push(new Date(e.updatedAt).getTime());
    }
    for (const s of p.logbookSubmissions) {
      if (s.submittedAt) stamps.push(new Date(s.submittedAt).getTime());
      for (const f of s.feedback) if (f.submittedAt) stamps.push(new Date(f.submittedAt).getTime());
    }
    const lastActivityAt = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;

    const sup = p.academicSupervisor;
    const atRisk = overdueLogs > 0 || lowAvgScore || noSupervisorFeedback;

    return {
      placementId: p.id,
      student: {
        id: p.student.id, firstName: p.student.firstName,
        lastName: p.student.lastName, email: p.student.email,
      },
      department:      p.student.programme?.name ?? null,
      supervisor:      sup ? { id: sup.id, name: `${sup.firstName} ${sup.lastName}` } : null,
      riskTier:        p.riskScores[0]?.riskTier ?? null,
      avgQualityScore, // number (1 dp) within [0,100], or null
      lastActivityAt,  // ISO string, or null
      flags:           { overdueLogs, lowAvgScore, noSupervisorFeedback },
      atRisk,
    };
  });

  // At-risk interns surface first.
  rows.sort((a, b) => Number(b.atRisk) - Number(a.atRisk));

  return { rows, summary: { total: rows.length, atRisk: rows.filter((r) => r.atRisk).length } };
}

// ── Cohort configuration ──────────────────────────────────────
// One CohortConfig exists per academic year (@@unique). The coordinator edits
// the config for the *active* year only; everything else here is read-only.

const COHORT_CONFIG_SELECT = {
  id:             true,
  minWeeklyHours: true,
  totalWeeks:     true,
  academicYear:   { select: { id: true, label: true } },
} as const;

type CohortConfigRow = {
  id: string;
  minWeeklyHours: number;
  totalWeeks: number;
  academicYear: { id: string; label: string };
};

function shapeCohortConfig(c: CohortConfigRow) {
  return {
    id:                c.id,
    minWeeklyHours:    c.minWeeklyHours,
    totalWeeks:        c.totalWeeks,
    academicYearId:    c.academicYear.id,
    academicYearLabel: c.academicYear.label,
  };
}

/** Cohort config for the active academic year. 404 when none is configured. */
export async function getActiveCohortConfig() {
  const config = await prisma.cohortConfig.findFirst({
    where:  { academicYear: { isActive: true } },
    select: COHORT_CONFIG_SELECT,
  });
  if (!config) throw new AppError(404, 'No cohort configuration for the active academic year');
  return shapeCohortConfig(config);
}

/** Set the active cohort's per-week minimum attendance hours. 404 when none exists. */
export async function updateActiveCohortConfig(input: { minWeeklyHours: number }) {
  const existing = await prisma.cohortConfig.findFirst({
    where:  { academicYear: { isActive: true } },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, 'No cohort configuration for the active academic year');

  const updated = await prisma.cohortConfig.update({
    where:  { id: existing.id },
    data:   { minWeeklyHours: input.minWeeklyHours },
    select: COHORT_CONFIG_SELECT,
  });
  return shapeCohortConfig(updated);
}

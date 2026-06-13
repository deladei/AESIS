import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import { meanQualityScore, SYSTEM_MAX_WEEKS } from '../../shared/utils/quality';
import { createNotification } from '../notifications/notifications.service';
import { assignSupervisor } from '../placements/placements.service';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { Prisma, type RiskTier, type NotificationType } from '@prisma/client';

// ── Dashboard ─────────────────────────────────────────────────

export async function getCoordinatorDashboard(opts: { academicYearId?: string } = {}) {
  // Cohort scope (item 17): when an academic year is given, every metric is
  // restricted to that cohort; otherwise the whole active population is counted.
  const cohort = opts.academicYearId ? { academicYearId: opts.academicYearId } : {};
  const activeScope: Prisma.PlacementWhereInput = { placementStatus: 'active', ...cohort };

  const [
    activePlacements,
    pendingApprovals,
    riskRows,
    scheduledByWeek,
    qualityRows,
    partnerCompanyRows,
    threshold,
    attentionPlacements,
  ] = await Promise.all([
    prisma.placement.count({ where: activeScope }),
    prisma.placement.count({ where: { placementStatus: 'pending', ...cohort } }),
    // Latest risk score per active placement — group by tier
    prisma.studentRiskScore.groupBy({
      by:    ['riskTier'],
      _count: { _all: true },
      where: { placement: activeScope },
    }),
    // All submissions for active placements — grouped by week
    prisma.logbookSubmission.groupBy({
      by:      ['weekNumber'],
      _count:  { _all: true },
      where:   { placement: activeScope },
      orderBy: { weekNumber: 'asc' },
    }),
    // Cohort-wide logbook quality scores (active placements). Averaged below via
    // the validated/clamped path so a corrupt stored score can't skew the mean.
    prisma.logbookAnalysis.findMany({
      select: { qualityScore: true },
      where:  { submission: { placement: activeScope } },
    }),
    // Distinct companies hosting at least one active placement
    prisma.placement.findMany({
      where:    { ...activeScope, companyId: { not: null } },
      select:   { companyId: true },
      distinct: ['companyId'],
    }),
    getActivePerformanceThreshold(),
    // Minimal per-placement data to derive the "needs attention" count (item 13).
    prisma.placement.findMany({
      where:  activeScope,
      select: {
        academicSupervisorId: true,
        logbookEntries:     { select: { status: true, submittedAt: true, periodEnd: true } },
        logbookSubmissions: { select: { analysis: { select: { qualityScore: true } } } },
      },
    }),
  ]);

  const submittedByWeek = await prisma.logbookSubmission.groupBy({
    by:      ['weekNumber'],
    _count:  { _all: true },
    where: {
      placement:        activeScope,
      submissionStatus: { in: ['submitted', 'approved', 'under_review'] },
    },
    orderBy: { weekNumber: 'asc' },
  });

  // Needs-attention count — same derivation as the intern table (item 13).
  const now = new Date();
  const needsAttention = attentionPlacements.reduce((n, p) => {
    const overdueLogs = p.logbookEntries.filter(e => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now).length;
    const submittedWeeks = p.logbookEntries.filter(e => e.submittedAt != null).length;
    const avgQualityScore = meanQualityScore(p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null));
    const { attention } = deriveAttention(
      { hasSupervisor: p.academicSupervisorId != null, submittedWeeks, overdueLogs, avgQualityScore },
      threshold,
    );
    return n + (attention ? 1 : 0);
  }, 0);

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

  // Cohort average performance (quality) via the validated/clamped path:
  // meanQualityScore drops null + out-of-range scores and clamps to [0, 100], so
  // a corrupt stored value can never push this metric outside that range. Null
  // when no log carries a valid score (UI renders "—").
  const avgPerformance = meanQualityScore(qualityRows.map((r) => r.qualityScore));

  return {
    overview: {
      activePlacements,
      pendingApprovals,
      complianceRate,
      highRiskCount:    riskDistribution.high,
      avgPerformance,
      hostCompanies: partnerCompanyRows.length,
      needsAttention,            // interns flagged by the at-risk derivation (item 13)
      performanceThreshold: threshold,
    },
    riskDistribution,
    submissionTrends,
    // Client-readable feature flags. AI Pulse Matching is roadmap-only and off
    // in production; the panel renders disabled until a real service exists.
    featureFlags: {
      aiPulseMatching: env.AI_PULSE_MATCHING,
    },
  };
}

// ── Student list ──────────────────────────────────────────────

export type StudentSortKey = 'name' | 'department' | 'supervisor' | 'progress' | 'score' | 'status';
export type SortDir = 'asc' | 'desc';
export type StatusFilter =
  | 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'rejected' | 'not_started';

export interface StudentListFilters {
  page:            number;
  limit:           number;
  riskTier?:       RiskTier;
  programmeId?:    string;
  supervisorId?:   string;        // a user id, or the literal 'unassigned'
  academicYearId?: string;
  status?:         StatusFilter;  // filters on the intern's LATEST entry status
  attention?:      boolean;       // true → only interns flagged as needing attention
  sortBy?:         StudentSortKey;
  sortDir?:        SortDir;
}

// Sort keys whose value is computed after the query (no Prisma orderBy exists).
const COMPUTED_SORTS: StudentSortKey[] = ['progress', 'score', 'status'];
// Stable ordering for the "status" sort (worst-progressed first when desc).
const STATUS_ORDER: Record<StatusFilter, number> = {
  not_started: 0, draft: 1, submitted: 2, returned: 3, rejected: 4, acknowledged: 5,
};

const STUDENT_SELECT = {
  id:        true,
  createdAt: true,
  flaggedAt: true,
  flagReason: true,
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
  // All real entries — the latest (week desc → [0]) drives the "last activity"
  // columns; the full set drives the overdue-log attention signal.
  logbookEntries: {
    orderBy: { weekNumber: 'desc' },
    select:  { weekNumber: true, status: true, submittedAt: true, periodEnd: true },
  },
  // Legacy submissions carry the AI quality scores → the low-score signal.
  logbookSubmissions: { select: { analysis: { select: { qualityScore: true } } } },
} satisfies Prisma.PlacementSelect;

// ── At-risk "Attention" signals (item 13) ─────────────────────
// A concrete, engagement-focused at-risk flag derived from real data (distinct
// from the AI risk *tier*): overdue weekly log, zero logbook progress, no
// academic supervisor, or a mean logbook quality score below the cohort's
// configured performance threshold. Pure + unit-testable.

export interface AttentionInput {
  hasSupervisor:  boolean;
  submittedWeeks: number;
  /** Draft entries whose period has already ended (overdue). */
  overdueLogs:    number;
  /** Validated mean quality score in [0,100], or null when nothing scorable. */
  avgQualityScore: number | null;
}

export interface AttentionResult {
  attention: boolean;
  reasons: {
    overdueLog:   boolean;
    zeroProgress: boolean;
    noSupervisor: boolean;
    lowScore:     boolean;
  };
}

/** Derive the attention flag + per-signal reasons. `threshold` 0 disables the
 *  low-score signal (no minimum configured). */
export function deriveAttention(input: AttentionInput, threshold: number): AttentionResult {
  const reasons = {
    overdueLog:   input.overdueLogs > 0,
    zeroProgress: input.submittedWeeks === 0,
    noSupervisor: !input.hasSupervisor,
    lowScore:     threshold > 0 && input.avgQualityScore !== null && input.avgQualityScore < threshold,
  };
  return { attention: Object.values(reasons).some(Boolean), reasons };
}

export async function listStudents(filters: StudentListFilters) {
  const { page, limit, riskTier, programmeId, supervisorId, academicYearId, status,
          attention, sortBy, sortDir = 'asc' } = filters;
  const { skip, take } = paginate(page, limit);
  const threshold = await getActivePerformanceThreshold();
  const now = new Date();

  const where: Prisma.PlacementWhereInput = {
    placementStatus: 'active',
    ...(riskTier ? { riskScores: { some: { riskTier } } } : {}),
    ...(programmeId ? { student: { programmeId } } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(supervisorId
      ? supervisorId === 'unassigned'
        ? { academicSupervisorId: null }
        : { academicSupervisorId: supervisorId }
      : {}),
  };

  // `status`/`attention` filter on values computed after the query, and
  // progress/score/status sort likewise — all need the full matching set loaded,
  // then filtered/sorted/paginated in memory. A cohort is bounded (tens of
  // interns), so this stays cheap. Everything else pages in the database.
  const inMemory = status != null || attention != null
    || (sortBy != null && COMPUTED_SORTS.includes(sortBy));

  const orderBy: Prisma.PlacementOrderByWithRelationInput =
    inMemory                  ? { createdAt: 'desc' }
    : sortBy === 'name'       ? { student: { lastName: sortDir } }
    : sortBy === 'department' ? { student: { programme: { name: sortDir } } }
    : sortBy === 'supervisor' ? { academicSupervisor: { lastName: sortDir } }
    : { createdAt: 'desc' };

  const placements = await prisma.placement.findMany({
    where,
    select: STUDENT_SELECT,
    orderBy,
    ...(inMemory ? {} : { skip, take }),
  });

  // Submitted-week counts for the fetched placements (one grouped query).
  const ids = placements.map(p => p.id);
  const submittedCounts = ids.length
    ? await prisma.logbookEntry.groupBy({
        by:     ['placementId'],
        _count: { _all: true },
        where:  { placementId: { in: ids }, submittedAt: { not: null } },
      })
    : [];
  const submittedMap = new Map(submittedCounts.map(r => [r.placementId, r._count._all]));

  let rows = placements.map(p => {
    const totalWeeks     = SYSTEM_MAX_WEEKS;
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    const sup            = p.academicSupervisor;
    const overdueLogs    = p.logbookEntries.filter(
      e => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now,
    ).length;
    const avgQualityScore = meanQualityScore(p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null));
    const { attention, reasons } = deriveAttention(
      { hasSupervisor: sup != null, submittedWeeks, overdueLogs, avgQualityScore },
      threshold,
    );
    return {
      placementId:     p.id,
      student:         {
        id: p.student.id, firstName: p.student.firstName,
        lastName: p.student.lastName, email: p.student.email,
      },
      department:      p.student.programme?.name ?? null,
      supervisor:      sup ? { id: sup.id, name: `${sup.firstName} ${sup.lastName}`.trim() } : null,
      riskTier:        p.riskScores[0]?.riskTier       ?? null,
      riskScore:       p.riskScores[0]?.riskScore != null
                         ? Number(p.riskScores[0].riskScore) : null,
      lastWeek:        p.logbookEntries[0]?.weekNumber  ?? null,
      lastStatus:      p.logbookEntries[0]?.status      ?? null,
      lastSubmittedAt: p.logbookEntries[0]?.submittedAt ?? null,
      flagged:         p.flaggedAt != null,
      flagReason:      p.flagReason ?? null,
      attention,                       // derived at-risk flag (item 13)
      attentionReasons: reasons,
      totalWeeks,
      submittedWeeks,
      progressPct:     totalWeeks > 0 ? Math.round((submittedWeeks / totalWeeks) * 100) : 0,
    };
  });

  if (inMemory) {
    if (status) {
      rows = rows.filter(r => (r.lastStatus ?? 'not_started') === status);
    }
    if (attention != null) {
      rows = rows.filter(r => r.attention === attention);
    }
    if (sortBy && COMPUTED_SORTS.includes(sortBy)) {
      const dir = sortDir === 'desc' ? -1 : 1;
      const value = (r: (typeof rows)[number]): number =>
        sortBy === 'progress' ? r.submittedWeeks
        : sortBy === 'score'  ? (r.riskScore ?? -1)
        : STATUS_ORDER[(r.lastStatus ?? 'not_started') as StatusFilter];
      rows.sort((a, b) => (value(a) - value(b)) * dir);
    }
    const total = rows.length;
    return { students: rows.slice(skip, skip + take), meta: buildMeta(total, page, limit) };
  }

  const total = await prisma.placement.count({ where });
  return { students: rows, meta: buildMeta(total, page, limit) };
}

// ── Filter options (for the Intern Status Monitor filter panel) ──

/** Academic programmes (shown as "Department" in the intern table). */
export async function listProgrammes() {
  const rows = await prisma.academicProgramme.findMany({
    orderBy: { name: 'asc' },
    select:  { id: true, name: true },
  });
  return rows;
}

/** Academic years / cohorts. */
export async function listCohorts() {
  const rows = await prisma.academicYear.findMany({
    orderBy: { startDate: 'desc' },
    select:  { id: true, label: true, isActive: true },
  });
  return rows;
}

// ── Intern actions (row ⋮ menu) ───────────────────────────────

/**
 * Send a notification to a placement's student and push it live. Shared by the
 * "message" and "send reminder" actions. (A notification is its own record;
 * these aren't entry state/score changes, so no AuditAction row is written.)
 */
async function notifyStudent(
  placementId: string,
  opts: { type: NotificationType; title: string; body: string; link?: string },
) {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId }, select: { studentId: true },
  });
  if (!placement) throw new AppError(404, 'Placement not found');

  const notif = await createNotification({
    userId: placement.studentId, type: opts.type, title: opts.title, body: opts.body, link: opts.link,
  });
  emitToUser(placement.studentId, 'notification:new', {
    id: notif.id, type: notif.type, title: notif.title, createdAt: notif.createdAt,
  });
  return { ok: true };
}

/** Coordinator sends a free-text message to an intern (in-app notification). */
export async function messageStudent(placementId: string, _actorId: string, message: string) {
  return notifyStudent(placementId, {
    type: 'system', title: 'Message from your coordinator', body: message,
    link: '/student/notifications',
  });
}

/** Coordinator nudges an intern to keep their logbook up to date. */
export async function remindStudent(placementId: string, _actorId: string) {
  return notifyStudent(placementId, {
    type: 'submission_reminder', title: 'Logbook reminder',
    body: 'Your coordinator is reminding you to keep your weekly logbook up to date.',
    link: '/student/logbook',
  });
}

/**
 * Flag / un-flag a placement for coordinator attention. The flag columns
 * (flaggedAt / flagReason / flaggedById) ARE the audit record, so no separate
 * AuditAction row is written. Returns the resulting flag state.
 */
export async function setFlag(placementId: string, coordinatorId: string, flagged: boolean, reason?: string) {
  const placement = await prisma.placement.findUnique({ where: { id: placementId }, select: { id: true } });
  if (!placement) throw new AppError(404, 'Placement not found');

  const updated = await prisma.placement.update({
    where: { id: placementId },
    data: flagged
      ? { flaggedAt: new Date(), flagReason: reason?.trim() || null, flaggedById: coordinatorId }
      : { flaggedAt: null, flagReason: null, flaggedById: null },
    select: { flaggedAt: true, flagReason: true },
  });
  return { flagged: updated.flaggedAt != null, flagReason: updated.flagReason ?? null };
}

// ── Bulk actions ──────────────────────────────────────────────

/** Send a reminder to many interns at once. Missing placements are skipped. */
export async function bulkRemind(placementIds: string[], actorId: string) {
  let sent = 0;
  for (const id of placementIds) {
    try { await remindStudent(id, actorId); sent++; } catch { /* skip missing */ }
  }
  return { sent, total: placementIds.length };
}

/** Assign one academic supervisor across many placements. Reuses the audited
 *  placements.assignSupervisor (which writes its own auditLog per placement). */
export async function bulkAssignSupervisor(placementIds: string[], coordinatorId: string, supervisorId: string) {
  let assigned = 0;
  for (const id of placementIds) {
    try { await assignSupervisor(id, coordinatorId, { supervisorId, kind: 'academic' }); assigned++; } catch { /* skip */ }
  }
  return { assigned, total: placementIds.length };
}

// ── CSV export ────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export active interns to CSV. `ids` limits to the selected placements;
 *  `academicYearId` scopes to one cohort; omit both for the whole active cohort. */
export async function exportStudentsCsv(opts: { ids?: string[]; academicYearId?: string } = {}) {
  const where: Prisma.PlacementWhereInput = {
    placementStatus: 'active',
    ...(opts.ids && opts.ids.length ? { id: { in: opts.ids } } : {}),
    ...(opts.academicYearId ? { academicYearId: opts.academicYearId } : {}),
  };
  const [placements, threshold] = await Promise.all([
    prisma.placement.findMany({ where, select: STUDENT_SELECT, orderBy: { createdAt: 'desc' } }),
    getActivePerformanceThreshold(),
  ]);
  const now = new Date();
  const ids = placements.map(p => p.id);
  const submittedCounts = ids.length
    ? await prisma.logbookEntry.groupBy({ by: ['placementId'], _count: { _all: true }, where: { placementId: { in: ids }, submittedAt: { not: null } } })
    : [];
  const submittedMap = new Map(submittedCounts.map(r => [r.placementId, r._count._all]));

  const header = ['Name', 'Email', 'Department', 'Supervisor', 'Last status', 'Risk tier', 'Risk score', 'Submitted weeks', 'Total weeks', 'Progress %', 'Needs attention'];
  const lines = [header.join(',')];
  for (const p of placements) {
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    const sup = p.academicSupervisor;
    const overdueLogs = p.logbookEntries.filter(e => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now).length;
    const avgQualityScore = meanQualityScore(p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null));
    const { attention } = deriveAttention({ hasSupervisor: sup != null, submittedWeeks, overdueLogs, avgQualityScore }, threshold);
    lines.push([
      `${p.student.firstName} ${p.student.lastName}`.trim(),
      p.student.email,
      p.student.programme?.name ?? '',
      sup ? `${sup.firstName} ${sup.lastName}`.trim() : 'Unassigned',
      p.logbookEntries[0]?.status ?? 'not_started',
      p.riskScores[0]?.riskTier ?? '',
      p.riskScores[0]?.riskScore != null ? Number(p.riskScores[0].riskScore).toFixed(3) : '',
      submittedWeeks,
      SYSTEM_MAX_WEEKS,
      SYSTEM_MAX_WEEKS > 0 ? Math.round((submittedWeeks / SYSTEM_MAX_WEEKS) * 100) : 0,
      attention ? 'yes' : 'no',
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

// ── Intern detail / profile ───────────────────────────────────

function supShape(u: { id: string; firstName: string; lastName: string; email: string } | null) {
  return u ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email } : null;
}

/**
 * Full profile for one intern: placement + student, supervisors, progress, the
 * weekly logs, AI quality average (validated/clamped), risk-score history,
 * supervisor feedback (entry-event comments), and supervisor-assignment history.
 * Read-only; the route is coordinator/admin-guarded.
 */
export async function getStudentDetail(placementId: string) {
  const placement = await prisma.placement.findUnique({
    where:  { id: placementId },
    select: {
      id: true, placementStatus: true, startDate: true, endDate: true,
      flaggedAt: true, flagReason: true,
      student: {
        select: { id: true, firstName: true, lastName: true, email: true, programme: { select: { name: true } } },
      },
      company:            { select: { name: true } },
      academicYear:       { select: { label: true } },
      academicSupervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
      companySupervisor:  { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!placement) throw new AppError(404, 'Placement not found');

  const [entries, riskHistory, eventRows, assignmentRows, analyses] = await Promise.all([
    prisma.logbookEntry.findMany({
      where:   { placementId },
      orderBy: { weekNumber: 'asc' },
      select:  { id: true, weekNumber: true, status: true, periodStart: true, periodEnd: true, submittedAt: true, hoursLogged: true },
    }),
    prisma.studentRiskScore.findMany({
      where:   { placementId },
      orderBy: { computedAt: 'desc' },
      take:    10,
      select:  { riskTier: true, riskScore: true, computedAt: true },
    }),
    // Supervisor feedback = entry events that carry a comment (return/reject/acknowledge).
    prisma.entryEvent.findMany({
      where:   { entry: { placementId }, comment: { not: null } },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  {
        comment: true, toStatus: true, createdAt: true,
        actor: { select: { firstName: true, lastName: true } },
        entry: { select: { weekNumber: true } },
      },
    }),
    // Supervisor-assignment history from the audit log.
    prisma.auditLog.findMany({
      where:   { entityType: 'placement', entityId: placementId, action: 'placement_status_change' },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select:  { metadata: true, createdAt: true, user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.logbookAnalysis.findMany({
      where:  { submission: { placementId } },
      select: { qualityScore: true },
    }),
  ]);

  const submittedWeeks = entries.filter(e => e.submittedAt != null).length;
  const totalWeeks = SYSTEM_MAX_WEEKS;

  return {
    placement: {
      id: placement.id, status: placement.placementStatus,
      startDate: placement.startDate, endDate: placement.endDate,
      company: placement.company?.name ?? null, cohort: placement.academicYear?.label ?? null,
      flagged: placement.flaggedAt != null, flagReason: placement.flagReason ?? null,
    },
    student: {
      id: placement.student.id,
      name: `${placement.student.firstName} ${placement.student.lastName}`.trim(),
      email: placement.student.email,
      department: placement.student.programme?.name ?? null,
    },
    supervisors: {
      academic: supShape(placement.academicSupervisor),
      company:  supShape(placement.companySupervisor),
    },
    progress: {
      submittedWeeks, totalWeeks,
      progressPct: totalWeeks > 0 ? Math.round((submittedWeeks / totalWeeks) * 100) : 0,
    },
    avgQuality: meanQualityScore(analyses.map(a => a.qualityScore)),
    entries: entries.map(e => ({
      id: e.id, weekNumber: e.weekNumber, status: e.status,
      periodStart: e.periodStart, periodEnd: e.periodEnd, submittedAt: e.submittedAt,
      hoursLogged: e.hoursLogged != null ? Number(e.hoursLogged) : null,
    })),
    riskHistory: riskHistory.map(r => ({ tier: r.riskTier, score: Number(r.riskScore), computedAt: r.computedAt })),
    feedback: eventRows.map(ev => ({
      week: ev.entry.weekNumber, comment: ev.comment, status: ev.toStatus,
      by: `${ev.actor.firstName} ${ev.actor.lastName}`.trim(), createdAt: ev.createdAt,
    })),
    supervisorHistory: assignmentRows
      .filter(a => (a.metadata as { change?: string } | null)?.change === 'supervisor_assigned')
      .map(a => ({
        at: a.createdAt,
        by: `${a.user.firstName} ${a.user.lastName}`.trim(),
        kind: (a.metadata as { kind?: string } | null)?.kind ?? 'academic',
      })),
  };
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

export async function getOversight(now: Date = new Date()) {
  // The low-score signal uses the cohort's configured performance threshold
  // (item 13) rather than a hardcoded value. 0 disables it.
  const lowAvgThreshold = await getActivePerformanceThreshold();
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
    const lowAvgScore = lowAvgThreshold > 0 && avgQualityScore !== null && avgQualityScore < lowAvgThreshold;

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
      supervisor:      sup ? { id: sup.id, name: `${sup.firstName} ${sup.lastName}`.trim() } : null,
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

// ── Supervisor workload (item 14) ─────────────────────────────
// Interns-per-supervisor across active placements, with an imbalance flag so a
// coordinator can rebalance. "Overloaded" = a supervisor carrying meaningfully
// more than the average active load; "imbalanced" = the busiest active
// supervisor carries at least IMBALANCE_SPREAD more interns than the quietest.

const IMBALANCE_SPREAD = 3;

export async function getSupervisorWorkload(opts: { academicYearId?: string } = {}) {
  const cohort = opts.academicYearId ? { academicYearId: opts.academicYearId } : {};
  const [supervisors, placements] = await Promise.all([
    prisma.user.findMany({
      where:   { role: 'academic_supervisor' },
      select:  { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.placement.findMany({
      where:  { placementStatus: 'active', ...cohort },
      select: { academicSupervisorId: true },
    }),
  ]);

  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const p of placements) {
    if (p.academicSupervisorId) counts.set(p.academicSupervisorId, (counts.get(p.academicSupervisorId) ?? 0) + 1);
    else unassigned++;
  }

  const assignedTotal  = placements.length - unassigned;
  const supervisingIds = [...counts.values()];
  const supervising    = supervisingIds.length;          // supervisors with ≥1 intern
  const mean           = supervising > 0 ? assignedTotal / supervising : 0;
  const max            = supervising > 0 ? Math.max(...supervisingIds) : 0;
  const min            = supervising > 0 ? Math.min(...supervisingIds) : 0;
  // A meaningful overload: at least two above the rounded average.
  const overloadAt     = Math.ceil(mean) + 2;
  const imbalanced     = supervising > 1 && (max - min) >= IMBALANCE_SPREAD;

  const rows = supervisors
    .map((s) => {
      const internCount = counts.get(s.id) ?? 0;
      return {
        supervisor: { id: s.id, name: `${s.firstName} ${s.lastName}`.trim() },
        internCount,
        overloaded: internCount > 0 && internCount >= overloadAt,
      };
    })
    .sort((a, b) => b.internCount - a.internCount);

  return {
    rows,
    unassigned,
    summary: {
      supervisors: supervising,
      assignedTotal,
      unassigned,
      mean: Math.round(mean * 10) / 10,
      max,
      min,
      spread: max - min,
      imbalanced,
    },
  };
}

// ── Performance distribution (item 15) ────────────────────────
// Spread of per-intern mean logbook quality scores across active placements,
// bucketed for a histogram, plus the interns below the configured threshold.
// Scores are validated/clamped to [0,100]; interns with nothing scorable are
// reported separately (never counted as 0).

const PERF_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0–19',   min: 0,  max: 20  },
  { label: '20–39',  min: 20, max: 40  },
  { label: '40–59',  min: 40, max: 60  },
  { label: '60–79',  min: 60, max: 80  },
  { label: '80–100', min: 80, max: 101 },
];

export async function getPerformanceDistribution(opts: { academicYearId?: string } = {}) {
  const cohort = opts.academicYearId ? { academicYearId: opts.academicYearId } : {};
  const [placements, threshold] = await Promise.all([
    prisma.placement.findMany({
      where:  { placementStatus: 'active', ...cohort },
      select: {
        id: true,
        student: { select: { firstName: true, lastName: true } },
        logbookSubmissions: { select: { analysis: { select: { qualityScore: true } } } },
      },
    }),
    getActivePerformanceThreshold(),
  ]);

  const scored = placements
    .map((p) => ({
      placementId: p.id,
      name: `${p.student.firstName} ${p.student.lastName}`.trim(),
      avg:  meanQualityScore(p.logbookSubmissions.map((s) => s.analysis?.qualityScore ?? null)),
    }))
    .filter((s): s is { placementId: string; name: string; avg: number } => s.avg !== null);

  const buckets = PERF_BUCKETS.map((b) => ({
    label: b.label,
    count: scored.filter((s) => s.avg >= b.min && s.avg < b.max).length,
  }));

  const belowThreshold = threshold > 0
    ? scored.filter((s) => s.avg < threshold).sort((a, b) => a.avg - b.avg)
    : [];

  return {
    threshold,
    scoredCount:   scored.length,
    unscoredCount: placements.length - scored.length,
    buckets,
    belowThreshold,
  };
}

// ── Cohort configuration ──────────────────────────────────────
// One CohortConfig exists per academic year (@@unique). The coordinator edits
// the config for the *active* year only; everything else here is read-only.

const COHORT_CONFIG_SELECT = {
  id:                   true,
  minWeeklyHours:       true,
  performanceThreshold: true,
  totalWeeks:           true,
  academicYear:         { select: { id: true, label: true } },
} as const;

type CohortConfigRow = {
  id: string;
  minWeeklyHours: number;
  performanceThreshold: number;
  totalWeeks: number;
  academicYear: { id: string; label: string };
};

function shapeCohortConfig(c: CohortConfigRow) {
  return {
    id:                   c.id,
    minWeeklyHours:       c.minWeeklyHours,
    performanceThreshold: c.performanceThreshold,
    totalWeeks:           c.totalWeeks,
    academicYearId:       c.academicYear.id,
    academicYearLabel:    c.academicYear.label,
  };
}

/**
 * Performance threshold (logbook quality score 0–100) for the active cohort,
 * below which an intern's mean score is "low". Falls back to DEFAULT_PERF_THRESHOLD
 * when no active config exists so the dashboards still derive a sensible flag.
 */
const DEFAULT_PERF_THRESHOLD = 50;
export async function getActivePerformanceThreshold(): Promise<number> {
  const config = await prisma.cohortConfig.findFirst({
    where:  { academicYear: { isActive: true } },
    select: { performanceThreshold: true },
  });
  return config?.performanceThreshold ?? DEFAULT_PERF_THRESHOLD;
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

/** Update the active cohort's editable settings (min weekly hours and/or the
 *  performance threshold). 404 when no active config exists. */
export async function updateActiveCohortConfig(input: { minWeeklyHours?: number; performanceThreshold?: number }) {
  const existing = await prisma.cohortConfig.findFirst({
    where:  { academicYear: { isActive: true } },
    select: { id: true },
  });
  if (!existing) throw new AppError(404, 'No cohort configuration for the active academic year');

  const updated = await prisma.cohortConfig.update({
    where:  { id: existing.id },
    data:   {
      ...(input.minWeeklyHours       !== undefined ? { minWeeklyHours:       input.minWeeklyHours }       : {}),
      ...(input.performanceThreshold !== undefined ? { performanceThreshold: input.performanceThreshold } : {}),
    },
    select: COHORT_CONFIG_SELECT,
  });
  return shapeCohortConfig(updated);
}

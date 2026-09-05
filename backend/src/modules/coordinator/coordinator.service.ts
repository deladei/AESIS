import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { AppError } from '../../middleware/errorHandler';
import {
  meanQualityScore, mergedQualityScores, weeksDue, engagementPercent,
} from '../../shared/utils/quality';
import { durationWeeksByAcademicYear, weeksForYear } from '../entries/entries.week';
import { createNotification } from '../notifications/notifications.service';
import { assignSupervisor } from '../placements/placements.service';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { refreshRiskSnapshots, latestRiskDistribution } from '../risk/risk.service';
import { Prisma, type RiskTier, type NotificationType } from '@prisma/client';

// ── Dashboard ─────────────────────────────────────────────────

export async function getCoordinatorDashboard(opts: { academicYearId?: string } = {}) {
  // Cohort scope (item 17): when an academic year is given, every metric is
  // restricted to that cohort; otherwise the whole active population is counted.
  const cohort = opts.academicYearId ? { academicYearId: opts.academicYearId } : {};
  const activeScope: Prisma.PlacementWhereInput = { placementStatus: 'active', ...cohort };

  // Snapshots first, so the tiers read below are current. Never throws.
  await refreshRiskSnapshots();

  const [
    activePlacements,
    pendingApprovals,
    riskDistribution,
    scheduledByWeek,
    qualityRows,
    v2QualityEntries,
    partnerCompanyRows,
    threshold,
    attentionPlacements,
  ] = await Promise.all([
    prisma.placement.count({ where: activeScope }),
    prisma.placement.count({ where: { placementStatus: 'pending', ...cohort } }),
    // Latest risk tier per active placement (the table is a movement history —
    // never aggregate it raw).
    latestRiskDistribution(activeScope),
    // All submissions for active placements — grouped by week
    prisma.logbookSubmission.groupBy({
      by:      ['weekNumber'],
      _count:  { _all: true },
      where:   { placement: activeScope },
      orderBy: { weekNumber: 'asc' },
    }),
    // Cohort-wide logbook quality scores (active placements). Averaged below via
    // the validated/clamped path so a corrupt stored score can't skew the mean.
    // Two sources: legacy logbook_analyses (frozen history — writer retired S82)…
    prisma.logbookAnalysis.findMany({
      select: { qualityScore: true },
      where:  { submission: { placement: activeScope } },
    }),
    // …and the v2 pipeline: latest ai_assessment.quality per weekly entry.
    prisma.logbookEntry.findMany({
      where:  { placement: activeScope, assessments: { some: {} } },
      select: { assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
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
        logbookEntries: {
          select: {
            status: true, submittedAt: true, periodEnd: true,
            assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
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
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));
    const { attention } = deriveAttention(
      { hasSupervisor: p.academicSupervisorId != null, submittedWeeks, overdueLogs, avgQualityScore },
      threshold,
    );
    return n + (attention ? 1 : 0);
  }, 0);

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
  const avgPerformance = meanQualityScore(mergedQualityScores(
    qualityRows.map((r) => r.qualityScore),
    v2QualityEntries,
  ));

  // Everything the top row of the dashboard reports, counted from real rows.
  const [totalStudents, placedStudents, applicationCount, shortlistedCount,
         recentApplications, partnerCompanies, upcomingDeadlines] = await Promise.all([
    prisma.user.count({ where: { role: 'student' } }),
    prisma.placement.count({
      where: { isCurrent: true, placementStatus: { in: ['active', 'completed'] } },
    }),
    prisma.opportunityApplication.count(),
    prisma.opportunityApplication.count({ where: { status: 'shortlisted' } }),
    prisma.opportunityApplication.findMany({
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: {
        id: true, status: true, submittedAt: true,
        student: { select: { firstName: true, lastName: true } },
        opportunity: {
          select: { title: true, company: { select: { name: true, logoUrl: true } } },
        },
      },
    }),
    // Ranked by real placement count — never a hand-ordered list.
    prisma.company.findMany({
      where: { placements: { some: { isCurrent: true, placementStatus: 'active' } } },
      select: {
        id: true, name: true, logoUrl: true, industry: true, isPartner: true,
        _count: { select: { placements: true } },
      },
      orderBy: { placements: { _count: 'desc' } },
      take: 8,
    }),
    prisma.internshipOpportunity.findMany({
      where: { status: 'published', closesAt: { gte: new Date() } },
      orderBy: { closesAt: 'asc' },
      take: 5,
      select: {
        id: true, title: true, closesAt: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  return {
    overview: {
      activePlacements,
      totalStudents,
      placedStudents,
      applications: applicationCount,
      shortlisted: shortlistedCount,
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
    recentApplications,
    partnerCompanies,
    upcomingDeadlines,
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
  | 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'not_started';

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
  not_started: 0, draft: 1, submitted: 2, returned: 3, acknowledged: 4,
};

const STUDENT_SELECT = {
  id:        true,
  createdAt: true,
  // Programme length is per cohort and progress is against what is due so far,
  // so both the year and the start date have to come back with the row.
  academicYearId: true,
  startDate: true,
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
  // columns; the full set drives the overdue-log attention signal and (via the
  // latest ai_assessment per entry) the v2 half of the quality signal.
  logbookEntries: {
    orderBy: { weekNumber: 'desc' },
    select:  {
      weekNumber: true, status: true, submittedAt: true, periodEnd: true,
      assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  },
  // Legacy submissions carry the frozen pre-S82 AI quality scores.
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
    ...(programmeId ? { student: { programmeId } } : {}),
    ...(academicYearId ? { academicYearId } : {}),
    ...(supervisorId
      ? supervisorId === 'unassigned'
        ? { academicSupervisorId: null }
        : { academicSupervisorId: supervisorId }
      : {}),
  };

  // `status`/`attention`/`riskTier` filter on values computed after the query
  // (riskTier must match the LATEST snapshot — `some:` would match historical
  // tiers), and progress/score/status sort likewise — all need the full
  // matching set loaded, then filtered/sorted/paginated in memory. A cohort is
  // bounded (tens of interns), so this stays cheap. Everything else pages in
  // the database.
  const inMemory = status != null || attention != null || riskTier != null
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

  const weeksByYear = await durationWeeksByAcademicYear(placements.map(p => p.academicYearId));

  let rows = placements.map(p => {
    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    const due            = weeksDue(p.startDate, programmeWeeks, now);
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    const sup            = p.academicSupervisor;
    const overdueLogs    = p.logbookEntries.filter(
      e => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now,
    ).length;
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));
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
      programmeWeeks,
      weeksDue:        due,
      submittedWeeks,
      progressPct:     engagementPercent(submittedWeeks, due),
    };
  });

  if (inMemory) {
    if (riskTier) {
      rows = rows.filter(r => r.riskTier === riskTier);
    }
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
  const weeksByYear = await durationWeeksByAcademicYear(placements.map(p => p.academicYearId));

  const header = ['Name', 'Email', 'Department', 'Supervisor', 'Last status', 'Risk tier', 'Risk score', 'Submitted weeks', 'Weeks due', 'Programme weeks', 'Progress %', 'Needs attention'];
  const lines = [header.join(',')];
  for (const p of placements) {
    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    const due = weeksDue(p.startDate, programmeWeeks, now);
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    const sup = p.academicSupervisor;
    const overdueLogs = p.logbookEntries.filter(e => e.status === 'draft' && e.periodEnd != null && new Date(e.periodEnd) < now).length;
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      p.logbookSubmissions.map(s => s.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));
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
      due,
      programmeWeeks,
      // Blank, not 0 — nothing is due yet, so there is no percentage.
      engagementPercent(submittedWeeks, due) ?? '',
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
      academicYearId: true,
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
      select:  {
        id: true, weekNumber: true, status: true, periodStart: true, periodEnd: true, submittedAt: true, hoursLogged: true,
        assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    }),
    prisma.studentRiskScore.findMany({
      where:   { placementId },
      orderBy: { computedAt: 'desc' },
      take:    10,
      select:  { riskTier: true, riskScore: true, computedAt: true },
    }),
    // Supervisor feedback = entry events that carry a comment (return/acknowledge).
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
  const weeksByYear = await durationWeeksByAcademicYear([placement.academicYearId]);
  const programmeWeeks = weeksForYear(weeksByYear, placement.academicYearId);
  const due = weeksDue(placement.startDate, programmeWeeks);

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
      submittedWeeks, weeksDue: due, programmeWeeks,
      progressPct: engagementPercent(submittedWeeks, due),
    },
    avgQuality: meanQualityScore(mergedQualityScores(analyses.map(a => a.qualityScore), entries)),
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
    entityId:   l.entityId,   // lets the frontend deep-link the row to its source (item 25)
    actor:      `${l.user.firstName} ${l.user.lastName}`,
    actorRole:  l.user.role,
    summary:    summarizeAudit(l.action, l.metadata),
    createdAt:  l.createdAt,
  }));
}

// ── Global search (item 18) ───────────────────────────────────
// Coordinator typeahead across the two real searchable entities — interns
// (active placements, by student name/email) and companies (by name). AESIS has
// no separate "project" entity. Case-insensitive, capped per group.

export async function searchEntities(q: string, limit = 5) {
  const query = q.trim();
  if (query.length < 2) return { interns: [], companies: [] };

  const [placements, companies] = await Promise.all([
    prisma.placement.findMany({
      where: {
        placementStatus: 'active',
        OR: [
          { student: { firstName: { contains: query, mode: 'insensitive' } } },
          { student: { lastName:  { contains: query, mode: 'insensitive' } } },
          { student: { email:     { contains: query, mode: 'insensitive' } } },
        ],
      },
      take:   limit,
      select: {
        id: true,
        student:    { select: { firstName: true, lastName: true, email: true } },
        company:    { select: { name: true } },
      },
    }),
    prisma.company.findMany({
      where:  { name: { contains: query, mode: 'insensitive' } },
      take:   limit,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, industry: true },
    }),
  ]);

  return {
    interns: placements.map((p) => ({
      placementId: p.id,
      name:        `${p.student.firstName} ${p.student.lastName}`.trim(),
      subtitle:    p.company?.name ?? p.student.email,
    })),
    companies: companies.map((c) => ({
      id:       c.id,
      name:     c.name,
      subtitle: c.industry ?? 'Host company',
    })),
  };
}

// ── Feature flags (item 24) ───────────────────────────────────
// Lightweight flags channel for the coordinator shell, so the nav can gate
// roadmap/optional surfaces without fetching the whole dashboard.

export function getFeatureFlags() {
  return {
    aiPulseMatching: env.AI_PULSE_MATCHING,
    aiInsights:      env.AI_INSIGHTS,
  };
}

// ── Supervisors (for assignment dropdowns) ────────────────────

export async function listSupervisors() {
  const supervisors = await prisma.user.findMany({
    where:   { role: 'academic_supervisor' },
    select:  { id: true, firstName: true, lastName: true, email: true, supervisedRegion: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });

  // Live caseload per supervisor (active + pending placements) so the
  // coordinator can see who is loaded before adjusting regions.
  const ids = supervisors.map((s) => s.id);
  const loads = ids.length
    ? await prisma.placement.groupBy({
        by:     ['academicSupervisorId'],
        where:  { academicSupervisorId: { in: ids }, placementStatus: { in: ['pending', 'active'] } },
        _count: { _all: true },
      })
    : [];
  const loadById = new Map(loads.map((l) => [l.academicSupervisorId, l._count._all]));

  return supervisors.map((s) => ({
    id:        s.id,
    firstName: s.firstName,
    lastName:  s.lastName,
    email:     s.email,
    region:    s.supervisedRegion,
    load:      loadById.get(s.id) ?? 0,
  }));
}

/** Coordinator sets (or clears) the single region an academic supervisor covers. */
export async function setSupervisorRegion(supervisorId: string, region: string | null) {
  const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
  if (!supervisor || supervisor.role !== 'academic_supervisor') {
    throw new AppError(404, 'Academic supervisor not found');
  }
  return prisma.user.update({
    where:  { id: supervisorId },
    data:   { supervisedRegion: region as never },
    select: { id: true, firstName: true, lastName: true, email: true, supervisedRegion: true },
  });
}

// ── Bulk supervisor roster upload ─────────────────────────────

export interface BulkSupervisorRow {
  firstName: string;
  lastName: string;
  email: string;
  region: string;
}

export type BulkSupervisorResult = {
  email: string;
  status: 'created' | 'updated' | 'skipped';
  region?: string;
  message?: string;
};

/**
 * Coordinator uploads a department supervisor roster (name, email, region). For
 * each row: create the academic_supervisor with their region, or — if the email
 * already exists as a supervisor — update their region/name (idempotent re-upload).
 * A non-supervisor email is skipped, never overwritten. New accounts are created
 * verified with a random unusable password; the supervisor sets their own via the
 * "Forgot password" flow. Supervisors join the coordinator's own department.
 * The student-registration auto-assign (pickLeastLoadedSupervisor) then routes
 * new interns in each region to its supervisor automatically.
 */
export async function bulkCreateSupervisors(coordinatorId: string, rows: BulkSupervisorRow[]) {
  const coordinator = await prisma.user.findUnique({
    where: { id: coordinatorId },
    select: { departmentId: true },
  });
  if (!coordinator) throw new AppError(404, 'Coordinator not found');

  const results: BulkSupervisorResult[] = [];
  let created = 0, updated = 0, skipped = 0;

  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    try {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
      if (existing) {
        if (existing.role !== 'academic_supervisor') {
          skipped++;
          results.push({ email, status: 'skipped', message: 'Email already belongs to a non-supervisor account' });
          continue;
        }
        await prisma.user.update({
          where: { id: existing.id },
          data: { firstName: r.firstName, lastName: r.lastName, supervisedRegion: r.region as never },
        });
        updated++;
        results.push({ email, status: 'updated', region: r.region });
      } else {
        const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), env.BCRYPT_ROUNDS);
        await prisma.user.create({
          data: {
            firstName: r.firstName,
            lastName: r.lastName,
            email,
            passwordHash,
            role: 'academic_supervisor',
            departmentId: coordinator.departmentId,
            isVerified: true,
            supervisedRegion: r.region as never,
          },
        });
        created++;
        results.push({ email, status: 'created', region: r.region });
      }
    } catch {
      skipped++;
      results.push({ email, status: 'skipped', message: 'Could not process this row' });
    }
  }

  return { total: rows.length, created, updated, skipped, results };
}

// ── Student class roster (pre-registration) ───────────────────

export type RosterRow = {
  firstName: string;
  lastName: string;
  email: string;
  indexNumber?: string | null;
};

export type RosterUploadResult = {
  email: string;
  status: 'created' | 'updated' | 'linked' | 'skipped';
  message?: string;
};

/**
 * Coordinator uploads the class list (name, email, optional index number).
 * Idempotent per email:
 *   • new email             → roster row created (awaiting the student's signup)
 *   • existing unclaimed    → name/index refreshed
 *   • existing claimed      → skipped (already registered — never overwritten)
 *   • email already a student account → row created pre-linked to that account
 * Registration then matches new students by email or index number and links
 * them automatically (see auth.service.register).
 */
export async function uploadStudentRoster(coordinatorId: string, rows: RosterRow[]) {
  const results: RosterUploadResult[] = [];
  let created = 0, updated = 0, linked = 0, skipped = 0;

  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    const indexNumber = r.indexNumber?.trim() || null;
    try {
      const existing = await prisma.studentRoster.findUnique({ where: { email } });
      if (existing) {
        if (existing.claimedById) {
          skipped++;
          results.push({ email, status: 'skipped', message: 'Already registered — left unchanged' });
          continue;
        }
        await prisma.studentRoster.update({
          where: { id: existing.id },
          data: { firstName: r.firstName, lastName: r.lastName, indexNumber },
        });
        updated++;
        results.push({ email, status: 'updated' });
        continue;
      }

      const account = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
      if (account && account.role !== 'student') {
        skipped++;
        results.push({ email, status: 'skipped', message: 'Email belongs to a non-student account' });
        continue;
      }

      await prisma.studentRoster.create({
        data: {
          firstName: r.firstName,
          lastName: r.lastName,
          email,
          indexNumber,
          uploadedById: coordinatorId,
          claimedById: account?.id ?? null,
          claimedAt: account ? new Date() : null,
        },
      });
      if (account) {
        linked++;
        results.push({ email, status: 'linked', message: 'Matched an existing student account' });
      } else {
        created++;
        results.push({ email, status: 'created' });
      }
    } catch {
      skipped++;
      results.push({ email, status: 'skipped', message: 'Could not process this row (duplicate index number?)' });
    }
  }

  return { total: rows.length, created, updated, linked, skipped, results };
}

/** Full class roster with registration status, newest first. */
export async function listStudentRoster() {
  const rows = await prisma.studentRoster.findMany({
    orderBy: [{ claimedAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      claimedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  return {
    total: rows.length,
    registered: rows.filter((r) => r.claimedById != null).length,
    rows: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      indexNumber: r.indexNumber,
      registered: r.claimedById != null,
      claimedAt: r.claimedAt,
      account: r.claimedBy
        ? { id: r.claimedBy.id, name: `${r.claimedBy.firstName} ${r.claimedBy.lastName}`.trim(), email: r.claimedBy.email }
        : null,
    })),
  };
}

/**
 * Placements created at registration whose region had no supervisor yet, so
 * they sit pending with no academic supervisor. The coordinator assigns one
 * from here (reusing PATCH /placements/:id/supervisor).
 */
export async function listUnassignedPlacements() {
  const placements = await prisma.placement.findMany({
    where: { academicSupervisorId: null, placementStatus: { in: ['pending', 'active'] } },
    select: {
      id: true,
      region: true,
      createdAt: true,
      student:  { select: { id: true, firstName: true, lastName: true, email: true } },
      company:  { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return placements.map((p) => ({
    id:        p.id,
    region:    p.region,
    createdAt: p.createdAt,
    student:   { id: p.student.id, name: `${p.student.firstName} ${p.student.lastName}`.trim(), email: p.student.email },
    company:   p.company?.name ?? null,
  }));
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
      // Active weekly pipeline — drives overdue + activity + v2 quality.
      logbookEntries: {
        select: {
          status: true, periodEnd: true, submittedAt: true, updatedAt: true,
          assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
      // Legacy submissions carry the frozen pre-S82 quality scores + written feedback.
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
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      p.logbookSubmissions.map((s) => s.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));
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
        logbookEntries: {
          select: { assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
        },
      },
    }),
    getActivePerformanceThreshold(),
  ]);

  const scored = placements
    .map((p) => ({
      placementId: p.id,
      name: `${p.student.firstName} ${p.student.lastName}`.trim(),
      avg:  meanQualityScore(mergedQualityScores(
        p.logbookSubmissions.map((s) => s.analysis?.qualityScore ?? null),
        p.logbookEntries,
      )),
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
  weightIndustry:       true,
  weightUniversity:     true,
  weightReport:         true,
  weightLogbook:        true,
  academicYear:         { select: { id: true, label: true } },
} as const;

type CohortConfigRow = {
  id: string;
  minWeeklyHours: number;
  performanceThreshold: number;
  totalWeeks: number;
  weightIndustry: number;
  weightUniversity: number;
  weightReport: number;
  weightLogbook: number;
  academicYear: { id: string; label: string };
};

function shapeCohortConfig(c: CohortConfigRow) {
  return {
    id:                   c.id,
    minWeeklyHours:       c.minWeeklyHours,
    performanceThreshold: c.performanceThreshold,
    totalWeeks:           c.totalWeeks,
    weightIndustry:       c.weightIndustry,
    weightUniversity:     c.weightUniversity,
    weightReport:         c.weightReport,
    weightLogbook:        c.weightLogbook,
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

/** Update the active cohort's editable settings (min weekly hours, performance
 *  threshold, and/or the four final-grade weights). The schema guarantees the
 *  weights, when present, arrive as a complete set summing to 100, so this just
 *  writes through. 404 when no active config exists. */
export async function updateActiveCohortConfig(input: {
  minWeeklyHours?: number;
  performanceThreshold?: number;
  weightIndustry?: number;
  weightUniversity?: number;
  weightReport?: number;
  weightLogbook?: number;
}) {
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
      ...(input.weightIndustry       !== undefined ? { weightIndustry:       input.weightIndustry }       : {}),
      ...(input.weightUniversity     !== undefined ? { weightUniversity:     input.weightUniversity }     : {}),
      ...(input.weightReport         !== undefined ? { weightReport:         input.weightReport }         : {}),
      ...(input.weightLogbook        !== undefined ? { weightLogbook:        input.weightLogbook }        : {}),
    },
    select: COHORT_CONFIG_SELECT,
  });
  return shapeCohortConfig(updated);
}

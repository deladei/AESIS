import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import {
  loadGradeOwnership,
  assertCanReadGrade,
  assertCanScoreComponent,
  assertCanManageGrade,
  serializeGrade,
  type GradeOwnership,
} from './grades.policy';
import { generateIndustryToken, hashIndustryToken } from './grades.token';
import {
  GRADE_COMPONENTS,
  type ComponentScoreInput,
  type OverrideInput,
  type IndustryScoreInput,
} from './grades.schema';

const round2 = (n: number) => Math.round(n * 100) / 100;

type Weights = { industry: number; university: number; report: number; logbook: number };
const DEFAULT_WEIGHTS: Weights = { industry: 30, university: 30, report: 30, logbook: 10 };

/** Cohort-configured aggregation weights for a placement's academic year. */
async function loadWeights(academicYearId: string): Promise<Weights> {
  const cfg = await prisma.cohortConfig.findUnique({
    where: { academicYearId },
    select: { weightIndustry: true, weightUniversity: true, weightReport: true, weightLogbook: true },
  });
  if (!cfg) return DEFAULT_WEIGHTS;
  return {
    industry: cfg.weightIndustry,
    university: cfg.weightUniversity,
    report: cfg.weightReport,
    logbook: cfg.weightLogbook,
  };
}

async function writeAudit(actor: Actor, action: Prisma.AuditLogCreateInput['action'], placementId: string, metadata: Prisma.InputJsonValue) {
  await prisma.auditLog.create({
    data: { userId: actor.id, action, entityType: 'final_grade', entityId: placementId, metadata },
  });
}

const RAW_FIELD = {
  industry: 'industryRaw',
  university: 'universityRaw',
  report: 'reportRaw',
  logbook: 'logbookRaw',
} as const;

/** Read the role-filtered grade view. */
export async function getGrade(actor: Actor, placementId: string) {
  const ownership = await loadGradeOwnership(placementId);
  assertCanReadGrade(actor, ownership);
  const grade = await prisma.finalGrade.findUnique({ where: { placementId } });
  return serializeGrade(actor, ownership, grade);
}

/**
 * Enter / update one component's raw score. Locked once released. If the grade
 * was already aggregated (approved), changing a component reverts it to draft —
 * the prior aggregate + sign-off no longer reflect the inputs, so it must be
 * re-aggregated.
 */
export async function scoreComponent(actor: Actor, placementId: string, input: ComponentScoreInput) {
  const ownership = await loadGradeOwnership(placementId);
  assertCanScoreComponent(actor, ownership, input.component);

  const existing = await prisma.finalGrade.findUnique({ where: { placementId } });
  if (existing?.status === 'released') {
    throw new AppError(409, 'This grade has been released and is locked');
  }

  const field = RAW_FIELD[input.component];
  const resetAggregate =
    existing?.status === 'approved'
      ? {
          status: 'draft' as const,
          industryWeighted: null,
          universityWeighted: null,
          reportWeighted: null,
          logbookWeighted: null,
          total: null,
          coordinatorOverride: null,
          overrideReason: null,
          signedOffById: null,
          signedOffAt: null,
        }
      : {};

  const grade = await prisma.finalGrade.upsert({
    where: { placementId },
    create: { placementId, [field]: input.raw },
    update: { [field]: input.raw, ...resetAggregate },
  });

  await writeAudit(actor, 'component_scored', placementId, {
    component: input.component,
    raw: input.raw,
    previous: existing ? (existing as Record<string, unknown>)[field] ?? null : null,
  });

  return serializeGrade(actor, ownership, grade);
}

/**
 * Aggregate the four components with cohort weights and sign off (draft →
 * approved). Every component must be present; otherwise 409 with the missing
 * list. This is the coordinator's (HoD) deliberate endorsement of the inputs.
 */
export async function aggregateGrade(actor: Actor, placementId: string) {
  const ownership: GradeOwnership = await loadGradeOwnership(placementId);
  assertCanManageGrade(actor);

  const grade = await prisma.finalGrade.findUnique({ where: { placementId } });
  if (!grade) throw new AppError(409, 'No component scores have been entered yet');
  if (grade.status === 'released') throw new AppError(409, 'This grade has been released and is locked');

  const raw = {
    industry: grade.industryRaw,
    university: grade.universityRaw,
    report: grade.reportRaw,
    logbook: grade.logbookRaw,
  };
  const missing = GRADE_COMPONENTS.filter((c) => raw[c] === null || raw[c] === undefined);
  if (missing.length > 0) {
    throw new AppError(409, `Cannot aggregate: missing component score(s): ${missing.join(', ')}`);
  }

  const w = await loadWeights(ownership.academicYearId);
  const weighted = {
    industry: round2((raw.industry! / 100) * w.industry),
    university: round2((raw.university! / 100) * w.university),
    report: round2((raw.report! / 100) * w.report),
    logbook: round2((raw.logbook! / 100) * w.logbook),
  };
  const total = round2(weighted.industry + weighted.university + weighted.report + weighted.logbook);

  const updated = await prisma.finalGrade.update({
    where: { placementId },
    data: {
      industryWeighted: weighted.industry,
      universityWeighted: weighted.university,
      reportWeighted: weighted.report,
      logbookWeighted: weighted.logbook,
      total,
      status: 'approved',
      signedOffById: actor.id,
      signedOffAt: new Date(),
    },
  });

  await writeAudit(actor, 'grade_signed_off', placementId, { weights: w, weighted, total });
  return serializeGrade(actor, ownership, updated);
}

/** Coordinator override of the aggregated total (reason mandatory). Requires an approved grade. */
export async function overrideGrade(actor: Actor, placementId: string, input: OverrideInput) {
  const ownership = await loadGradeOwnership(placementId);
  assertCanManageGrade(actor);

  const grade = await prisma.finalGrade.findUnique({ where: { placementId } });
  if (!grade) throw new AppError(409, 'No grade to override');
  if (grade.status !== 'approved') {
    throw new AppError(409, 'Aggregate and sign off the grade before overriding it');
  }

  const updated = await prisma.finalGrade.update({
    where: { placementId },
    data: { coordinatorOverride: input.total, overrideReason: input.reason },
  });

  await writeAudit(actor, 'grade_overridden', placementId, {
    from: grade.total,
    to: input.total,
    reason: input.reason,
  });
  return serializeGrade(actor, ownership, updated);
}

/** Release an approved grade — its total becomes student-visible. Terminal. */
export async function releaseGrade(actor: Actor, placementId: string) {
  const ownership = await loadGradeOwnership(placementId);
  assertCanManageGrade(actor);

  const grade = await prisma.finalGrade.findUnique({ where: { placementId } });
  if (!grade) throw new AppError(409, 'No grade to release');
  if (grade.status === 'released') throw new AppError(409, 'This grade is already released');
  if (grade.status !== 'approved') {
    throw new AppError(409, 'Aggregate and sign off the grade before releasing it');
  }

  const updated = await prisma.finalGrade.update({
    where: { placementId },
    data: { status: 'released', releasedAt: new Date() },
  });

  await writeAudit(actor, 'grade_released', placementId, {
    total: updated.total,
    coordinatorOverride: updated.coordinatorOverride,
  });
  return serializeGrade(actor, ownership, updated);
}

/**
 * Coordinator/admin — the immutable audit trail for one placement's grade.
 * Every grade mutation made by an authenticated user (draft/invite, component
 * score, sign-off, override, release) writes an `audit_logs` row with
 * entityType `final_grade`; this returns them newest-first with the actor.
 *
 * Note: the public industry-score submission has NO audit row (the company
 * supervisor has no user id) — `industrySubmittedAt` on the grade is its record.
 */
export async function getGradeAudit(actor: Actor, placementId: string) {
  await loadGradeOwnership(placementId); // 404 if the placement is gone
  assertCanManageGrade(actor);

  const logs = await prisma.auditLog.findMany({
    where: { entityType: 'final_grade', entityId: placementId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { firstName: true, lastName: true, role: true } } },
  });

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    actor: l.user ? { name: `${l.user.firstName} ${l.user.lastName}`, role: l.user.role } : null,
    metadata: l.metadata,
    at: l.createdAt,
  }));
}

/**
 * Bulk-release every approved grade in a cohort (academic year). Only `approved`
 * grades are released — `draft` grades are skipped (never released un-aggregated)
 * and already-`released` grades are left untouched. Coordinator (HoD) authority.
 * Each release is audited individually (the bulk action is the sum of its
 * per-grade releases), so a partial run is still a faithful record and re-running
 * picks up only what's still `approved`.
 */
export async function releaseCohort(actor: Actor, academicYearId: string) {
  assertCanManageGrade(actor);

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true },
  });
  if (!year) throw new AppError(404, 'Academic year not found');

  const approved = await prisma.finalGrade.findMany({
    where: { status: 'approved', placement: { academicYearId } },
    select: { id: true, placementId: true, total: true, coordinatorOverride: true },
  });

  const releasedAt = new Date();
  for (const g of approved) {
    await prisma.finalGrade.update({
      where: { id: g.id },
      data: { status: 'released', releasedAt },
    });
    await writeAudit(actor, 'grade_released', g.placementId, {
      total: g.total,
      coordinatorOverride: g.coordinatorOverride,
      bulk: true,
    });
  }

  return { academicYearId, released: approved.length };
}

/**
 * Coordinator/admin: a flat report of every RELEASED final grade in an academic
 * year, joined to the student / company / supervisor / region for export. The
 * full breakdown (all four components + total) is intentionally exposed — this
 * is the coordinator's own cohort record, the same role the console already
 * shows everything to. Draft/approved (not-yet-released) grades are excluded:
 * a report row represents a grade the student can already see.
 */
export async function getCohortReport(actor: Actor, academicYearId: string) {
  assertCanManageGrade(actor);

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, label: true },
  });
  if (!year) throw new AppError(404, 'Academic year not found');

  const grades = await prisma.finalGrade.findMany({
    where: { status: 'released', placement: { academicYearId } },
    select: {
      industryRaw: true, universityRaw: true, reportRaw: true, logbookRaw: true,
      total: true, coordinatorOverride: true, releasedAt: true,
      placement: {
        select: {
          region: true,
          company: { select: { name: true } },
          student: { select: { firstName: true, lastName: true, indexNumber: true } },
          academicSupervisor: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { placement: { student: { lastName: 'asc' } } },
  });

  const rows = grades.map((g) => {
    const p = g.placement;
    const sup = p.academicSupervisor;
    return {
      studentName: `${p.student.firstName} ${p.student.lastName}`,
      indexNumber: p.student.indexNumber ?? null,
      company: p.company?.name ?? null,
      region: p.region ?? null,
      supervisor: sup ? `${sup.firstName} ${sup.lastName}` : null,
      industry: g.industryRaw,
      university: g.universityRaw,
      report: g.reportRaw,
      logbook: g.logbookRaw,
      total: g.total,
      effectiveTotal: g.coordinatorOverride ?? g.total,
      releasedAt: g.releasedAt,
    };
  });

  return { academicYearId, academicYear: year.label, count: rows.length, rows };
}

// Final-grade classification bands. Grounded in the existing finalization
// `recommendation` enum (pass | distinction | resit | fail) rather than an
// invented cutoff — distinction 70+, pass 50–69, resit 40–49, fail <40. The
// UI labels each band with its range so the threshold is never hidden.
const BAND_MIN = { distinction: 70, pass: 50, resit: 40, fail: 0 } as const;

/**
 * Coordinator/admin: distribution + summary stats over the RELEASED grades in an
 * academic year — for the cohort dashboard. Objective stats (n / mean / median /
 * min / max / 10-point histogram) plus classification-band counts and a pass
 * rate (share scoring ≥ 50). Per the "no impossible metric" rule, mean/median/
 * pass-rate are null when there are no released grades (the UI renders "—").
 */
export async function getCohortGradeStats(actor: Actor, academicYearId: string) {
  assertCanManageGrade(actor);

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, label: true },
  });
  if (!year) throw new AppError(404, 'Academic year not found');

  const grades = await prisma.finalGrade.findMany({
    where: { status: 'released', placement: { academicYearId } },
    select: { total: true, coordinatorOverride: true },
  });

  // Effective score = override ?? total. Guard against a released-but-null total
  // (shouldn't happen, but never let it poison the stats).
  const scores = grades
    .map((g) => g.coordinatorOverride ?? g.total)
    .filter((n): n is number => n !== null && n !== undefined)
    .sort((a, b) => a - b);

  const n = scores.length;
  if (n === 0) {
    return {
      academicYearId, academicYear: year.label, count: 0,
      mean: null, median: null, min: null, max: null, passRate: null,
      bands: { distinction: 0, pass: 0, resit: 0, fail: 0 },
      distribution: Array<number>(10).fill(0),
    };
  }

  const mean = round2(scores.reduce((s, v) => s + v, 0) / n);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? scores[mid] : round2((scores[mid - 1] + scores[mid]) / 2);

  // Ten 10-point buckets: bucket i covers [i*10, i*10+10); 100 lands in the last.
  const distribution = Array<number>(10).fill(0);
  const bands = { distinction: 0, pass: 0, resit: 0, fail: 0 };
  for (const s of scores) {
    distribution[Math.min(9, Math.floor(s / 10))] += 1;
    if (s >= BAND_MIN.distinction) bands.distinction += 1;
    else if (s >= BAND_MIN.pass) bands.pass += 1;
    else if (s >= BAND_MIN.resit) bands.resit += 1;
    else bands.fail += 1;
  }
  const passRate = Math.round(((bands.distinction + bands.pass) / n) * 100);

  return {
    academicYearId, academicYear: year.label, count: n,
    mean, median, min: scores[0], max: scores[n - 1], passRate,
    bands, distribution,
  };
}

/**
 * Coordinator/admin: released grades rolled up by the placement's Ghana region —
 * count, mean (of the effective score) and pass rate (share ≥ 50) per region.
 * Region-less released grades (legacy, never backfilled) collapse into a single
 * `region: null` row the UI labels "Unspecified" — they're reported, not hidden.
 * Sorted by headcount desc, then region name.
 */
export async function getCohortRegionRollups(actor: Actor, academicYearId: string) {
  assertCanManageGrade(actor);

  const year = await prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, label: true },
  });
  if (!year) throw new AppError(404, 'Academic year not found');

  const grades = await prisma.finalGrade.findMany({
    where: { status: 'released', placement: { academicYearId } },
    select: { total: true, coordinatorOverride: true, placement: { select: { region: true } } },
  });

  // Bucket effective scores by region (null region → the 'null' key).
  const byRegion = new Map<string, number[]>();
  for (const g of grades) {
    const eff = g.coordinatorOverride ?? g.total;
    if (eff === null || eff === undefined) continue;
    const key = g.placement.region ?? ' null'; // sentinel for null region
    const list = byRegion.get(key) ?? [];
    list.push(eff);
    byRegion.set(key, list);
  }

  const regions = [...byRegion.entries()]
    .map(([key, scores]) => {
      const n = scores.length;
      const passing = scores.filter((s) => s >= BAND_MIN.pass).length;
      return {
        region: key === ' null' ? null : key,
        count: n,
        mean: round2(scores.reduce((s, v) => s + v, 0) / n),
        passRate: Math.round((passing / n) * 100),
      };
    })
    .sort((a, b) => b.count - a.count || (a.region ?? '~').localeCompare(b.region ?? '~'));

  const count = regions.reduce((s, r) => s + r.count, 0);
  return { academicYearId, academicYear: year.label, count, regions };
}

// ── Batch B — tokenised company-supervisor industry-score channel ─────────────

// When a component changes after sign-off, the prior aggregate + sign-off no
// longer reflect the inputs, so the grade reverts to draft (same rule as
// scoreComponent). Released grades are locked and never reach this patch.
const AGGREGATE_RESET = {
  status: 'draft' as const,
  industryWeighted: null,
  universityWeighted: null,
  reportWeighted: null,
  logbookWeighted: null,
  total: null,
  coordinatorOverride: null,
  overrideReason: null,
  signedOffById: null,
  signedOffAt: null,
};

/**
 * Coordinator (HoD) issues a single-use magic link for the company supervisor to
 * submit the industry score without an account. The raw token is returned ONCE;
 * only its hash is stored. Re-inviting rotates the token. Upserts the grade row.
 */
export async function inviteIndustryScore(actor: Actor, placementId: string) {
  await loadGradeOwnership(placementId); // 404 if placement gone
  assertCanManageGrade(actor);

  const existing = await prisma.finalGrade.findUnique({ where: { placementId } });
  if (existing?.status === 'released') {
    throw new AppError(409, 'This grade has been released and is locked');
  }

  const { token, tokenHash } = generateIndustryToken();
  const expiresAt = new Date(Date.now() + env.INDUSTRY_SCORE_TOKEN_TTL_HOURS * 3_600_000);

  await prisma.finalGrade.upsert({
    where: { placementId },
    create: { placementId, industryTokenHash: tokenHash, industryTokenExpiresAt: expiresAt },
    update: { industryTokenHash: tokenHash, industryTokenExpiresAt: expiresAt },
  });

  await writeAudit(actor, 'grade_drafted', placementId, { action: 'industry_invite', expiresAt });

  return { token, url: `${env.FRONTEND_URL}/grade/${token}`, expiresAt };
}

async function loadGradeByIndustryToken(token: string) {
  const grade = await prisma.finalGrade.findFirst({
    where: { industryTokenHash: hashIndustryToken(token) },
    include: {
      placement: {
        select: {
          startDate: true,
          endDate: true,
          company: { select: { name: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!grade) throw new AppError(404, 'Invalid scoring link');
  if (grade.industrySubmittedAt) throw new AppError(410, 'This industry score has already been submitted');
  if (grade.status === 'released') throw new AppError(410, 'This grade has been released and is locked');
  if (!grade.industryTokenExpiresAt || grade.industryTokenExpiresAt.getTime() < Date.now()) {
    throw new AppError(410, 'This scoring link has expired');
  }
  return grade;
}

/** Public — render the industry-score form context. No auth (the token IS auth). */
export async function getIndustryInviteContext(token: string) {
  const grade = await loadGradeByIndustryToken(token);
  const p = grade.placement;
  return {
    organisation: p.company?.name ?? null,
    student: `${p.student.firstName} ${p.student.lastName}`,
    startDate: p.startDate,
    endDate: p.endDate,
  };
}

/**
 * Public — record the company supervisor's industry score. Single-use: stamps
 * industrySubmittedAt and clears the token so the link can't be replayed. If the
 * grade was already aggregated, this reverts it to draft (the inputs changed).
 * No AuditLog row — the submitter has no user id; industrySubmittedAt is the
 * durable record.
 */
export async function submitIndustryScore(token: string, input: IndustryScoreInput) {
  const grade = await loadGradeByIndustryToken(token);

  await prisma.finalGrade.update({
    where: { id: grade.id },
    data: {
      industryRaw: input.raw,
      industrySubmittedAt: new Date(),
      industryTokenHash: null,
      industryTokenExpiresAt: null,
      ...(grade.status === 'approved' ? AGGREGATE_RESET : {}),
    },
  });

  return { submitted: true };
}

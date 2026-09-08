import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import { resolveAssessmentToken } from './industry.token';
import type { IndustryAssessmentScores, PaperAssessmentInput } from './industry.schema';
import {
  ASSESSMENT_INDUSTRY_MAXIMA,
  ASSESSMENT_INDUSTRY_TOTAL,
} from '../../shared/validation/fields';

// The confidential 7-criterion industry evaluation (30/100 marks once
// weighted). Two arrival paths, both leaving evidence:
//   paper   → staff keys a scanned form; scan_url + entered_by are mandatory
//   digital → a verified supervisor's single-use token; token_id mandatory
// The DB CHECKs (maxima, raw_total = sum, paper_needs_evidence) are the last
// line; this service is the readable first line.
//
// CONFIDENTIALITY: staff-only reads. The student and the academic supervisor
// never see this table — the paper form travelled under confidential cover to
// the HoD, and the serializer in grades.policy keeps even the mapped
// industryRaw away from both.

const isStaff = (a: Actor) => a.role === 'admin' || a.role === 'coordinator' || a.role === 'hod';

const CRITERIA = ['attendance', 'punctuality', 'cooperation', 'aptitude', 'understanding', 'safety', 'autonomy'] as const;

const totalOf = (s: IndustryAssessmentScores) => CRITERIA.reduce((sum, c) => sum + s[c], 0);

async function assertGradeNotReleased(placementId: string) {
  const grade = await prisma.finalGrade.findUnique({ where: { placementId }, select: { status: true } });
  if (grade?.status === 'released') {
    throw new AppError(409, 'This grade has been released and is locked');
  }
}

/**
 * Map an assessment's /100 raw total onto the grade spine. Mirrors
 * scoreComponent's rules: locked once released; an approved aggregate reverts
 * to draft because its inputs changed.
 */
async function mapToIndustryRaw(placementId: string, rawTotal: number) {
  const existing = await prisma.finalGrade.findUnique({ where: { placementId } });
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

  await prisma.finalGrade.upsert({
    where: { placementId },
    create: { placementId, industryRaw: rawTotal },
    update: { industryRaw: rawTotal, ...resetAggregate },
  });
}

/** Staff-only read of a placement's confidential industry assessments. */
export async function listIndustryAssessments(actor: Actor, placementId: string) {
  if (!isStaff(actor)) {
    throw new AppError(403, 'The industry assessment is confidential to the coordinator and HoD');
  }
  return prisma.assessmentIndustry.findMany({
    where: { placementId },
    include: { industrySupervisor: { select: { name: true, designation: true, verificationStatus: true } } },
    orderBy: { submittedAt: 'asc' },
  });
}

/** Paper fallback: coordinator uploads the scan and keys in the scores. */
export async function submitPaperAssessment(actor: Actor, placementId: string, input: PaperAssessmentInput) {
  if (!isStaff(actor)) {
    throw new AppError(403, 'Only the coordinator may enter a paper industry assessment');
  }

  const supervisor = await prisma.industrySupervisor.findUnique({
    where: { id: input.industrySupervisorId },
    select: { id: true, placementId: true },
  });
  if (!supervisor || supervisor.placementId !== placementId) {
    throw new AppError(404, 'Industry supervisor not found on this placement');
  }

  await assertGradeNotReleased(placementId);

  const rawTotal = totalOf(input);
  const scores = {
    attendance: input.attendance,
    punctuality: input.punctuality,
    cooperation: input.cooperation,
    aptitude: input.aptitude,
    understanding: input.understanding,
    safety: input.safety,
    autonomy: input.autonomy,
    rawTotal,
    additionalComments: input.additionalComments ?? null,
    reportingOfficerName: input.reportingOfficerName,
    reportingOfficerDesignation: input.reportingOfficerDesignation ?? null,
    companyHodName: input.companyHodName ?? null,
  };

  const assessment = await prisma.assessmentIndustry.upsert({
    where: {
      placementId_industrySupervisorId: { placementId, industrySupervisorId: input.industrySupervisorId },
    },
    create: {
      placementId,
      industrySupervisorId: input.industrySupervisorId,
      ...scores,
      origin: 'paper',
      scanUrl: input.scanUrl,
      enteredById: actor.id,
      tokenId: null,
    },
    update: {
      ...scores,
      origin: 'paper',
      scanUrl: input.scanUrl,
      enteredById: actor.id,
      tokenId: null,
    },
  });

  await mapToIndustryRaw(placementId, rawTotal);
  return assessment;
}

/** Context for the public form: who is assessing whom (no scores exposed). */
export async function getAssessmentFormContext(rawToken: string) {
  const token = await resolveAssessmentToken(rawToken, 'final_assessment');
  const placement = await prisma.placement.findUniqueOrThrow({
    where: { id: token.placementId },
    select: {
      student: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  });
  return {
    supervisorName: token.industrySupervisor.name,
    studentName: `${placement.student.firstName} ${placement.student.lastName}`,
    companyName: placement.company?.name ?? null,
    expiresAt: token.expiresAt,
  };
}

/**
 * Digital path: the verified supervisor submits through their single-use link.
 * The token is consumed in the SAME transaction as the write it authorizes.
 */
export async function submitDigitalAssessment(rawToken: string, input: IndustryAssessmentScores) {
  const token = await resolveAssessmentToken(rawToken, 'final_assessment');
  await assertGradeNotReleased(token.placementId);

  const rawTotal = totalOf(input);
  const scores = {
    attendance: input.attendance,
    punctuality: input.punctuality,
    cooperation: input.cooperation,
    aptitude: input.aptitude,
    understanding: input.understanding,
    safety: input.safety,
    autonomy: input.autonomy,
    rawTotal,
    additionalComments: input.additionalComments ?? null,
    reportingOfficerName: input.reportingOfficerName,
    reportingOfficerDesignation: input.reportingOfficerDesignation ?? null,
    companyHodName: input.companyHodName ?? null,
  };

  const [assessment] = await prisma.$transaction([
    prisma.assessmentIndustry.upsert({
      where: {
        placementId_industrySupervisorId: {
          placementId: token.placementId,
          industrySupervisorId: token.industrySupervisorId,
        },
      },
      create: {
        placementId: token.placementId,
        industrySupervisorId: token.industrySupervisorId,
        ...scores,
        origin: 'digital',
        tokenId: token.id,
        enteredById: null,
      },
      update: {
        ...scores,
        origin: 'digital',
        tokenId: token.id,
        enteredById: null,
      },
    }),
    // Single-use: consumed atomically with the write. A concurrent second
    // submit loses on updateMany's usedAt guard and the whole tx rolls back.
    prisma.assessmentToken.update({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  await mapToIndustryRaw(token.placementId, rawTotal);
  return { rawTotal: assessment.rawTotal, submittedAt: assessment.submittedAt };
}

// ── Departmental skill gaps ───────────────────────────────────

/**
 * Where the department's students are weakest, according to the employers who
 * worked with them.
 *
 * The seven criteria carry FIXED maxima that are identical for every student
 * (`ASSESSMENT_INDUSTRY_MAXIMA`), which is what makes them comparable across a
 * cohort at all — unlike `PlacementAssessment.evaluation.criteria`, whose
 * criterion names are free text supplied per submission and therefore cannot
 * be aggregated honestly.
 *
 * No AI is involved. This is a mean over a table that is already populated.
 */

/**
 * Below this many placements a criterion mean stops being a cohort statistic
 * and starts being one identifiable student's confidential marks. Five is the
 * conventional small-cell floor: with four, a reader who knows the names can
 * reconstruct individuals from seven means and a total.
 */
export const MIN_SKILL_GAP_COHORT = 5;

const CRITERION_LABELS: Record<(typeof CRITERIA)[number], string> = {
  attendance:    'Attendance',
  punctuality:   'Punctuality',
  cooperation:   'Cooperation',
  aptitude:      'Aptitude',
  understanding: 'Understanding',
  safety:        'Safety',
  autonomy:      'Autonomy',
};

export interface SkillGapCriterion {
  key:       (typeof CRITERIA)[number];
  label:     string;
  max:       number;
  /** Mean of the per-placement means, 1dp. Null when nothing valid was scored. */
  meanRaw:   number | null;
  /** The only figure comparable ACROSS criteria — they have different maxima. */
  pctOfMax:  number | null;
  /** Placements contributing to THIS criterion; can be below the cohort n. */
  n:         number;
}

/**
 * `mean` bounded by each criterion's own maximum.
 *
 * Deliberately not `meanQualityScore` from shared/utils: that clamps to 0–100,
 * and these are bounded by 20, 15 or 10. Using it would silently accept a 20
 * in a field whose maximum is 10.
 */
function meanBounded(values: number[], max: number): number | null {
  // Out-of-range values leave BOTH the numerator and the denominator, so a
  // mis-keyed paper form cannot drag a mean down while still counting as
  // evidence. The DB CHECKs make this rare; a hand-keyed scan makes it possible.
  const valid = values.filter((v) => Number.isInteger(v) && v >= 0 && v <= max);
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

export async function getIndustrySkillGaps(
  actor: Actor,
  opts: { academicYearId?: string; programmeId?: string } = {},
) {
  if (!isStaff(actor)) {
    throw new AppError(403, 'The industry assessment is confidential to the coordinator and HoD');
  }

  const placements = await prisma.placement.findMany({
    where: {
      // NOT `placementStatus: 'active'`, which the other cohort aggregates use.
      // The employer evaluation arrives at the END of the attachment, by which
      // time the placement is `completed` — filtering on active would return
      // almost nothing and read as "no data" for ever.
      isCurrent:       true,
      placementStatus: { not: 'cancelled' },
      ...(opts.academicYearId ? { academicYearId: opts.academicYearId } : {}),
      ...(opts.programmeId ? { student: { programmeId: opts.programmeId } } : {}),
      industryAssessments: { some: {} },
    },
    select: {
      id: true,
      // Only the seven marks. No `additionalComments` (free text that routinely
      // names the student), no supervisor names, no scan URL.
      industryAssessments: {
        select: {
          attendance: true, punctuality: true, cooperation: true,
          aptitude: true, understanding: true, safety: true, autonomy: true,
        },
      },
    },
  });

  const n = placements.length;

  if (n < MIN_SKILL_GAP_COHORT) {
    // The whole panel is withheld, not individual cells: a partial table is
    // exactly what a reader differences to recover the withheld figures. No
    // means are computed at all, so there is nothing to leak.
    return {
      hasData:    n > 0,
      suppressed: true,
      n,
      threshold:  MIN_SKILL_GAP_COHORT,
      criteria:   [] as SkillGapCriterion[],
      rawTotalMean: null,
    };
  }

  const criteria: SkillGapCriterion[] = CRITERIA.map((key) => {
    const max = ASSESSMENT_INDUSTRY_MAXIMA[key];

    // Per placement first, then across placements. A placement assessed by two
    // unit supervisors has two rows (@@unique placementId+industrySupervisorId);
    // averaging rows directly would give it double weight and make `n` wrong.
    const perPlacement = placements
      .map((p) => meanBounded(p.industryAssessments.map((a) => a[key]), max))
      .filter((v): v is number => v !== null);

    const mean = perPlacement.length
      ? perPlacement.reduce((sum, v) => sum + v, 0) / perPlacement.length
      : null;

    return {
      key,
      label:    CRITERION_LABELS[key],
      max,
      meanRaw:  mean === null ? null : Math.round(mean * 10) / 10,
      pctOfMax: mean === null ? null : Math.round((mean / max) * 100),
      n:        perPlacement.length,
    };
  })
    // Weakest first — that ordering IS the answer this report exists to give.
    // Ranking on the raw mean would put 15/20 below 8/10; the percentage is the
    // only figure comparable across criteria with different maxima. Ties break
    // on the key so a printed report does not reorder between refreshes.
    .sort((a, b) => {
      if (a.pctOfMax === b.pctOfMax) return a.key.localeCompare(b.key);
      if (a.pctOfMax === null) return 1;
      if (b.pctOfMax === null) return -1;
      return a.pctOfMax - b.pctOfMax;
    });

  // Summed here rather than via `totalOf`, which expects the whole submitted
  // form including the reporting officer's name — fields this query
  // deliberately does not select.
  const totals = placements
    .map((p) => meanBounded(
      p.industryAssessments.map((a) => CRITERIA.reduce((sum, c) => sum + a[c], 0)),
      ASSESSMENT_INDUSTRY_TOTAL,
    ))
    .filter((v): v is number => v !== null);

  return {
    hasData:    true,
    suppressed: false,
    n,
    threshold:  MIN_SKILL_GAP_COHORT,
    criteria,
    rawTotalMean: totals.length
      ? Math.round((totals.reduce((sum, v) => sum + v, 0) / totals.length) * 10) / 10
      : null,
  };
}

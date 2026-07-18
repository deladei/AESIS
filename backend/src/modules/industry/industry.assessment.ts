import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import { resolveAssessmentToken } from './industry.token';
import type { IndustryAssessmentScores, PaperAssessmentInput } from './industry.schema';

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

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import { generateAttestationToken, hashAttestationToken } from './attestation.token';
import {
  summarizePlacementViaFastApi,
  type SummarizeFn,
} from './placement.summary.client';
import type { AssessmentInput, FinalizeInput, AttestInput } from './finalization.schema';

// Placement finalization is SEPARATE from the weekly review path (Path 3) and
// runs once at the end. The binding reviewer is the academic supervisor.

type PlacementCore = {
  id: string;
  academicSupervisorId: string | null;
  companySupervisorId: string | null;
  finalizationStatus: 'active' | 'assessment_pending' | 'finalized';
};

const PLACEMENT_SELECT = {
  id: true,
  academicSupervisorId: true,
  companySupervisorId: true,
  finalizationStatus: true,
} satisfies Prisma.PlacementSelect;

async function loadPlacement(placementId: string): Promise<PlacementCore> {
  const p = await prisma.placement.findUnique({ where: { id: placementId }, select: PLACEMENT_SELECT });
  if (!p) throw new AppError(404, 'Placement not found');
  return p as PlacementCore;
}

/** Only the assigned academic supervisor (or admin) may assess/finalize. */
function assertCanFinalize(actor: Actor, placement: PlacementCore): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'academic_supervisor' && placement.academicSupervisorId === actor.id) return;
  throw new AppError(403, 'Only the assigned academic supervisor may assess or finalize this placement');
}

/** Academic supervisor (own), coordinator, or admin may invite an attestation. */
function assertCanInvite(actor: Actor, placement: PlacementCore): void {
  if (actor.role === 'admin' || actor.role === 'coordinator' || actor.role === 'hod') return;
  if (actor.role === 'academic_supervisor' && placement.academicSupervisorId === actor.id) return;
  throw new AppError(403, 'Not permitted to invite a company attestation for this placement');
}

// ── Binding assessment ────────────────────────────────────────
export async function recordAssessment(actor: Actor, placementId: string, input: AssessmentInput) {
  const placement = await loadPlacement(placementId);
  assertCanFinalize(actor, placement);
  if (placement.finalizationStatus === 'finalized') {
    throw new AppError(409, 'Placement is already finalized; its assessment is locked');
  }

  // Evaluation is validated (ratings 1–5) by the Zod schema before it reaches
  // here; only set it when provided so re-recording a grade can't wipe it.
  const evaluation =
    input.evaluation !== undefined ? (input.evaluation as unknown as Prisma.InputJsonValue) : undefined;

  const assessment = await prisma.placementAssessment.upsert({
    where: { placementId },
    create: {
      placementId,
      academicSupervisorId: actor.id,
      grade: input.grade,
      narrative: input.narrative ?? null,
      ...(evaluation !== undefined && { evaluation }),
    },
    update: {
      grade: input.grade,
      narrative: input.narrative ?? null,
      academicSupervisorId: actor.id,
      ...(evaluation !== undefined && { evaluation }),
    },
  });

  // active -> assessment_pending once an assessment exists.
  if (placement.finalizationStatus === 'active') {
    await prisma.placement.update({
      where: { id: placementId },
      data: { finalizationStatus: 'assessment_pending' },
    });
  }
  return assessment;
}

// ── Finalization ──────────────────────────────────────────────
export async function finalizePlacement(
  actor: Actor,
  placementId: string,
  input: FinalizeInput,
  summarize: SummarizeFn = summarizePlacementViaFastApi,
) {
  const placement = await loadPlacement(placementId);
  assertCanFinalize(actor, placement);
  if (placement.finalizationStatus === 'finalized') {
    throw new AppError(409, 'Placement is already finalized');
  }

  const assessment = await prisma.placementAssessment.findUnique({ where: { placementId } });
  if (!assessment) {
    throw new AppError(409, 'Record a placement assessment (grade) before finalizing');
  }

  const entries = await prisma.logbookEntry.findMany({
    where: { placementId },
    include: { activities: { orderBy: { activityDate: 'asc' } } },
    orderBy: { weekNumber: 'asc' },
  });

  // Every existing week must be acknowledged or explicitly waived with a reason.
  const waivedWeeks = new Set(input.waivers.map((w) => w.weekNumber));
  const unresolved = entries.filter((e) => e.status !== 'acknowledged' && !waivedWeeks.has(e.weekNumber));
  if (unresolved.length > 0) {
    throw new AppError(
      409,
      `Cannot finalize: week(s) ${unresolved.map((e) => e.weekNumber).join(', ')} are neither acknowledged nor waived`,
    );
  }

  // Optional regulation gate (config flag, default off).
  if (env.COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION) {
    const attestation = await prisma.companyAttestation.findUnique({ where: { placementId } });
    if (!attestation?.confirmed) {
      throw new AppError(
        409,
        'A confirmed company attestation is required before finalization (per current configuration)',
      );
    }
  }

  // Cross-week AI summary over the ACKNOWLEDGED corpus — ONCE, advisory, fail-open.
  const acknowledged = entries.filter((e) => e.status === 'acknowledged');
  let crossWeekSummary: Prisma.InputJsonValue | undefined;
  try {
    const result = await summarize({
      placement_id: placementId,
      entries: acknowledged.map((e) => ({
        week_number: e.weekNumber,
        activities: e.activities.map((a) => ({
          description: a.description,
          competency_tags: a.competencyTags,
        })),
      })),
    });
    crossWeekSummary = result.summary as unknown as Prisma.InputJsonValue;
  } catch (err) {
    logger.warn('cross-week summary unavailable; finalizing without it (advisory only)', {
      placementId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const waivers =
    input.waivers.length > 0
      ? input.waivers.map((w) => ({
          weekNumber: w.weekNumber,
          reason: w.reason,
          waivedBy: actor.id,
          waivedAt: new Date().toISOString(),
        }))
      : undefined;

  await prisma.$transaction([
    prisma.placement.update({ where: { id: placementId }, data: { finalizationStatus: 'finalized' } }),
    prisma.placementAssessment.update({
      where: { placementId },
      data: {
        finalizedAt: new Date(),
        ...(waivers && { waivers: waivers as unknown as Prisma.InputJsonValue }),
        ...(crossWeekSummary !== undefined && { crossWeekSummary }),
      },
    }),
  ]);

  return prisma.placementAssessment.findUniqueOrThrow({ where: { placementId } });
}

// ── Final assessment package (gated closeout view) ────────────

type FinalAssessmentOwnership = {
  studentId: string;
  academicSupervisorId: string | null;
  companySupervisorId: string | null;
};

/**
 * Visibility gate for the closeout package. Faculty (own), coordinator and admin
 * may always see it (in-progress included). The student and company supervisor
 * see it only once the placement is FINALIZED (signed off) — an in-progress
 * grade is never exposed to them.
 */
function assertCanViewFinalAssessment(actor: Actor, p: FinalAssessmentOwnership, finalized: boolean): void {
  if (actor.role === 'admin' || actor.role === 'coordinator' || actor.role === 'hod') return;
  if (actor.role === 'academic_supervisor' && p.academicSupervisorId === actor.id) return;

  const isStudent = actor.role === 'student' && p.studentId === actor.id;
  const isCompany = actor.role === 'company_supervisor' && p.companySupervisorId === actor.id;
  if (isStudent || isCompany) {
    if (!finalized) {
      throw new AppError(403, 'The final assessment is available once the internship is finalized');
    }
    return;
  }
  throw new AppError(403, 'Access denied');
}

export async function getFinalAssessment(actor: Actor, placementId: string) {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: {
      studentId: true, academicSupervisorId: true, companySupervisorId: true,
      finalizationStatus: true, startDate: true, endDate: true,
      student: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
      placementAssessment: {
        select: {
          grade: true, narrative: true, evaluation: true, crossWeekSummary: true, finalizedAt: true,
          academicSupervisor: { select: { firstName: true, lastName: true } },
        },
      },
      companyAttestation: { select: { confirmed: true, comment: true, attestedAt: true } },
      documents: {
        where:   { docType: 'final_report' },
        orderBy: { uploadedAt: 'desc' },
        take:    1,
        select:  { id: true, fileName: true, fileUrl: true, uploadedAt: true },
      },
    },
  });
  if (!placement) throw new AppError(404, 'Placement not found');

  const finalized = placement.finalizationStatus === 'finalized';
  assertCanViewFinalAssessment(actor, placement, finalized);

  const a = placement.placementAssessment;
  const report = placement.documents[0] ?? null;
  const att = placement.companyAttestation;

  return {
    finalizationStatus: placement.finalizationStatus,
    finalized,
    student:      `${placement.student.firstName} ${placement.student.lastName}`,
    organisation: placement.company?.name ?? null,
    startDate:    placement.startDate,
    endDate:      placement.endDate,
    grade:        a?.grade ?? null,
    narrative:    a?.narrative ?? null,
    evaluation:   a?.evaluation ?? null,
    signedOffBy:  a?.academicSupervisor
      ? `${a.academicSupervisor.firstName} ${a.academicSupervisor.lastName}` : null,
    signedOffAt:  a?.finalizedAt ?? null,
    crossWeekSummary: a?.crossWeekSummary ?? null, // advisory AI summary — never a grade input
    finalReport: report
      ? { fileName: report.fileName, fileUrl: report.fileUrl, uploadedAt: report.uploadedAt } : null,
    companyAttestation: att
      ? { confirmed: att.confirmed, comment: att.comment, attestedAt: att.attestedAt } : null,
  };
}

// ── Company attestation (magic link, no account) ──────────────
export async function inviteAttestation(actor: Actor, placementId: string) {
  const placement = await loadPlacement(placementId);
  assertCanInvite(actor, placement);

  const { token, tokenHash } = generateAttestationToken();
  const tokenExpiresAt = new Date(Date.now() + env.ATTESTATION_TOKEN_TTL_HOURS * 3_600_000);

  await prisma.companyAttestation.upsert({
    where: { placementId },
    create: { placementId, magicLinkTokenHash: tokenHash, tokenExpiresAt, confirmed: false },
    // Re-inviting rotates the token and clears any prior (unconfirmed) state.
    update: {
      magicLinkTokenHash: tokenHash,
      tokenExpiresAt,
      confirmed: false,
      comment: null,
      attestedAt: null,
    },
  });

  // The raw token is returned ONCE — the caller delivers it to the company
  // supervisor (e.g. by email). Only its hash is stored.
  return { token, url: `${env.FRONTEND_URL}/attest/${token}`, expiresAt: tokenExpiresAt };
}

async function loadOpenAttestationByToken(token: string) {
  const att = await prisma.companyAttestation.findFirst({
    where: { magicLinkTokenHash: hashAttestationToken(token) },
    include: {
      placement: {
        select: {
          id: true,
          academicSupervisorId: true,
          startDate: true,
          endDate: true,
          company: { select: { name: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!att) throw new AppError(404, 'Invalid attestation link');
  if (att.attestedAt) throw new AppError(410, 'This attestation has already been submitted');
  if (att.tokenExpiresAt.getTime() < Date.now()) throw new AppError(410, 'This attestation link has expired');
  return att;
}

/** Public — render the attestation form context. No auth. */
export async function getAttestationContext(token: string) {
  const att = await loadOpenAttestationByToken(token);
  const p = att.placement;
  return {
    organisation: p.company?.name ?? null,
    student: `${p.student.firstName} ${p.student.lastName}`,
    startDate: p.startDate,
    endDate: p.endDate,
  };
}

/** Public — record the company supervisor's attestation. Single-use. No auth. */
export async function submitAttestation(token: string, input: AttestInput) {
  const att = await loadOpenAttestationByToken(token);
  const updated = await prisma.companyAttestation.update({
    where: { id: att.id },
    data: { confirmed: input.confirmed, comment: input.comment ?? null, attestedAt: new Date() },
  });

  // Notify the academic supervisor that the company supervisor has responded, so
  // they can review and finalize. Best-effort — a notification failure must never
  // fail the (single-use) attestation submission itself.
  const supervisorId = att.placement.academicSupervisorId;
  if (supervisorId) {
    const student = `${att.placement.student.firstName} ${att.placement.student.lastName}`;
    const org = att.placement.company?.name ?? 'The host company';
    try {
      await prisma.notification.create({
        data: {
          userId: supervisorId,
          type: 'system',
          title: 'Company attestation received',
          body: input.confirmed
            ? `${org} has attested ${student}'s internship. Review and finalize the placement.`
            : `${org} returned ${student}'s attestation with concerns. Review before finalizing.`,
          link: '/supervisor/finalize',
          metadata: { placementId: att.placement.id, confirmed: input.confirmed },
        },
      });
    } catch (err) {
      logger.error('Attestation notification failed', { err, placementId: att.placement.id });
    }
  }

  return { confirmed: updated.confirmed, attestedAt: updated.attestedAt };
}

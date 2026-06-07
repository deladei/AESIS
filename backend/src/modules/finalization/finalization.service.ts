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
  if (actor.role === 'admin' || actor.role === 'coordinator') return;
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

  const assessment = await prisma.placementAssessment.upsert({
    where: { placementId },
    create: {
      placementId,
      academicSupervisorId: actor.id,
      grade: input.grade,
      narrative: input.narrative ?? null,
    },
    update: { grade: input.grade, narrative: input.narrative ?? null, academicSupervisorId: actor.id },
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
  return { confirmed: updated.confirmed, attestedAt: updated.attestedAt };
}

import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import { assessmentSchema, finalizeSchema, attestSchema } from './finalization.schema';
import {
  recordAssessment,
  finalizePlacement,
  inviteAttestation,
  getAttestationContext,
  submitAttestation,
  getFinalAssessment,
} from './finalization.service';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(1).max(256) });

function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

// ── Authenticated (academic supervisor / coordinator / admin) ──
export async function recordAssessmentHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = assessmentSchema.parse(req.body);
  const assessment = await recordAssessment(actorOf(req), id, input);
  return created(res, assessment);
}

export async function finalizeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = finalizeSchema.parse(req.body ?? {});
  const result = await finalizePlacement(actorOf(req), id, input);
  return ok(res, result);
}

export async function getFinalAssessmentHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const data = await getFinalAssessment(actorOf(req), id);
  return ok(res, data);
}

export async function inviteAttestationHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const invite = await inviteAttestation(actorOf(req), id);
  return created(res, invite);
}

// ── Public (no auth — magic link) ─────────────────────────────
export async function attestationContextHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  const context = await getAttestationContext(token);
  return ok(res, context);
}

export async function submitAttestationHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  const input = attestSchema.parse(req.body);
  const result = await submitAttestation(token, input);
  return ok(res, result);
}

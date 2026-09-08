import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import { componentScoreSchema, overrideSchema, industryScoreSchema } from './grades.schema';
import {
  getGrade, scoreComponent, aggregateGrade, overrideGrade, releaseGrade,
  inviteIndustryScore, inviteWeeklyComment, getIndustryInviteContext, submitIndustryScore,
  getGradeAudit, releaseCohort, getCohortReport, getCohortGradeStats, getCohortRegionRollups,
} from './grades.service';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });
const yearParam = z.object({ academicYearId: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(1) });

function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

export async function getGradeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  return ok(res, await getGrade(actorOf(req), id));
}

export async function scoreComponentHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = componentScoreSchema.parse(req.body);
  return ok(res, await scoreComponent(actorOf(req), id, input));
}

export async function aggregateGradeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  return ok(res, await aggregateGrade(actorOf(req), id));
}

export async function overrideGradeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = overrideSchema.parse(req.body);
  return ok(res, await overrideGrade(actorOf(req), id, input));
}

export async function releaseGradeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  return ok(res, await releaseGrade(actorOf(req), id));
}

export async function gradeAuditHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  return ok(res, await getGradeAudit(actorOf(req), id));
}

export async function releaseCohortHandler(req: Request, res: Response) {
  const { academicYearId } = yearParam.parse(req.params);
  return ok(res, await releaseCohort(actorOf(req), academicYearId));
}

export async function cohortReportHandler(req: Request, res: Response) {
  const { academicYearId } = yearParam.parse(req.params);
  return ok(res, await getCohortReport(actorOf(req), academicYearId));
}

export async function cohortStatsHandler(req: Request, res: Response) {
  const { academicYearId } = yearParam.parse(req.params);
  return ok(res, await getCohortGradeStats(actorOf(req), academicYearId));
}

export async function cohortRegionsHandler(req: Request, res: Response) {
  const { academicYearId } = yearParam.parse(req.params);
  return ok(res, await getCohortRegionRollups(actorOf(req), academicYearId));
}

// ── Batch B — industry-score magic link ──

export async function inviteIndustryHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  return ok(res, await inviteIndustryScore(actorOf(req), id));
}

// Public (token = auth) — no actorOf.
export async function industryContextHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  return ok(res, await getIndustryInviteContext(token));
}

export async function submitIndustryHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  const input = industryScoreSchema.parse(req.body);
  return ok(res, await submitIndustryScore(token, input));
}

/** The weekly-feedback link for the same company supervisor. */
const weeklyInviteSchema = z.object({
  // Optional: the service defaults to the newest submitted week, which is the
  // one a supervisor would actually be commenting on.
  weekNumber: z.coerce.number().int().min(1).max(52).optional(),
  send:       z.coerce.boolean().optional(),
});

export async function inviteWeeklyHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = weeklyInviteSchema.parse(req.body ?? {});
  return ok(res, await inviteWeeklyComment(actorOf(req), id, input));
}

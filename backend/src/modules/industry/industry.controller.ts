import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  createIndustrySupervisorSchema,
  updateIndustrySupervisorSchema,
  verifySupervisorSchema,
  visitConfirmSchema,
  paperAssessmentSchema,
  industryAssessmentScoresSchema,
  paperWeeklyCommentSchema,
  digitalWeeklyCommentSchema,
} from './industry.schema';
import {
  listWeeklyComments,
  submitPaperWeeklyComment,
  getWeeklyCommentFormContext,
  submitDigitalWeeklyComment,
} from './industry.weekly';
import {
  listIndustryAssessments,
  submitPaperAssessment,
  getAssessmentFormContext,
  submitDigitalAssessment,
} from './industry.assessment';
import {
  createSupervisor,
  listSupervisors,
  updateSupervisor,
  verifySupervisor,
  visitConfirmSupervisor,
} from './industry.service';
import { issueAssessmentToken } from './industry.token';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });

function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

export async function createSupervisorHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  const input = createIndustrySupervisorSchema.parse(req.body);
  return created(res, await createSupervisor(actorOf(req), id, input));
}

export async function listSupervisorsHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  return ok(res, await listSupervisors(actorOf(req), id));
}

export async function updateSupervisorHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = updateIndustrySupervisorSchema.parse(req.body);
  return ok(res, await updateSupervisor(actorOf(req), id, input));
}

export async function verifySupervisorHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = verifySupervisorSchema.parse(req.body);
  return ok(res, await verifySupervisor(actorOf(req), id, input));
}

export async function visitConfirmHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = visitConfirmSchema.parse(req.body);
  return ok(res, await visitConfirmSupervisor(actorOf(req), id, input));
}

export async function listAssessmentsHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  return ok(res, await listIndustryAssessments(actorOf(req), id));
}

export async function paperAssessmentHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  const input = paperAssessmentSchema.parse(req.body);
  return created(res, await submitPaperAssessment(actorOf(req), id, input));
}

const tokenParam = z.object({ token: z.string().min(32).max(128) });

export async function formContextHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  return ok(res, await getAssessmentFormContext(token));
}

export async function digitalAssessmentHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  const input = industryAssessmentScoresSchema.parse(req.body);
  return created(res, await submitDigitalAssessment(token, input));
}

const weekQuery = z.object({ week: z.coerce.number().int().min(1).max(52).optional() });

export async function listWeeklyCommentsHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  const { week } = weekQuery.parse(req.query);
  return ok(res, await listWeeklyComments(actorOf(req), id, week));
}

export async function paperWeeklyCommentHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params); // placement id
  const input = paperWeeklyCommentSchema.parse(req.body);
  return created(res, await submitPaperWeeklyComment(actorOf(req), id, input));
}

export async function weeklyFormContextHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  return ok(res, await getWeeklyCommentFormContext(token));
}

export async function digitalWeeklyCommentHandler(req: Request, res: Response) {
  const { token } = tokenParam.parse(req.params);
  const input = digitalWeeklyCommentSchema.parse(req.body);
  return created(res, await submitDigitalWeeklyComment(token, input));
}

const issueTokenSchema = z.object({
  purpose: z.enum(['weekly_comment', 'final_assessment']),
  weekNumber: z.number().int().min(1).max(52).optional(),
});

export async function issueTokenHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = issueTokenSchema.parse(req.body);
  return created(res, await issueAssessmentToken(actorOf(req), id, input));
}

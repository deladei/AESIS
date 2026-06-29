import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import { componentScoreSchema, overrideSchema } from './grades.schema';
import { getGrade, scoreComponent, aggregateGrade, overrideGrade, releaseGrade } from './grades.service';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });

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

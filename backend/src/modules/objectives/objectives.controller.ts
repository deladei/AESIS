import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';
import { defineObjectiveSchema, entryObjectivesSchema } from './objectives.schema';
import * as service from './objectives.service';

const idParam = z.object({ id: z.string().uuid() });
const entryObjectiveParams = z.object({ id: z.string().uuid(), objectiveId: z.string().uuid() });

function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

// ── per-placement objectives ──
export async function defineObjectiveHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = defineObjectiveSchema.parse(req.body);
  const objective = await service.defineObjective(actorOf(req), id, input);
  return created(res, objective);
}

export async function listObjectivesHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const data = await service.listObjectives(actorOf(req), id);
  return ok(res, data);
}

// ── per-entry links ──
export async function listEntryObjectivesHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const data = await service.listEntryObjectives(actorOf(req), id);
  return ok(res, data);
}

export async function addEntryObjectivesHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { objectiveIds } = entryObjectivesSchema.parse(req.body);
  const data = await service.addEntryObjectives(actorOf(req), id, objectiveIds);
  return ok(res, data);
}

export async function suggestEntryObjectivesHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { objectiveIds } = entryObjectivesSchema.parse(req.body);
  const data = await service.suggestEntryObjectives(actorOf(req), id, objectiveIds);
  return ok(res, data);
}

export async function confirmEntryObjectiveHandler(req: Request, res: Response) {
  const { id, objectiveId } = entryObjectiveParams.parse(req.params);
  const data = await service.confirmEntryObjective(actorOf(req), id, objectiveId);
  return ok(res, data);
}

export async function removeEntryObjectiveHandler(req: Request, res: Response) {
  const { id, objectiveId } = entryObjectiveParams.parse(req.params);
  const data = await service.removeEntryObjective(actorOf(req), id, objectiveId);
  return ok(res, data);
}

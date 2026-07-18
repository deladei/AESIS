import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  createIndustrySupervisorSchema,
  updateIndustrySupervisorSchema,
  verifySupervisorSchema,
  visitConfirmSchema,
} from './industry.schema';
import {
  createSupervisor,
  listSupervisors,
  updateSupervisor,
  verifySupervisor,
  visitConfirmSupervisor,
} from './industry.service';
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

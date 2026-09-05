import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import { createApprovalSchema, decideApprovalSchema } from './approvals.schema';
import * as service from './approvals.service';

const idParam = z.object({ id: z.string().uuid() });
const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listPendingHandler(req: Request, res: Response) {
  ok(res, await service.listPending(actorOf(req)));
}

export async function createHandler(req: Request, res: Response) {
  created(res, await service.createApproval(actorOf(req), createApprovalSchema.parse(req.body)));
}

export async function decideHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.decideApproval(actorOf(req), id, decideApprovalSchema.parse(req.body)));
}

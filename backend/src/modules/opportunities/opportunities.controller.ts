import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  createOpportunitySchema, applySchema, decideApplicationSchema, applicationStatus,
} from './opportunities.schema';
import * as service from './opportunities.service';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({ status: z.string().optional() });
const appQuery = z.object({
  status: applicationStatus.optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});
const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listHandler(req: Request, res: Response) {
  ok(res, await service.listOpportunities(actorOf(req), listQuery.parse(req.query)));
}

export async function createHandler(req: Request, res: Response) {
  created(res, await service.createOpportunity(actorOf(req), createOpportunitySchema.parse(req.body)));
}

export async function publishHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.publishOpportunity(actorOf(req), id));
}

export async function applyHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  created(res, await service.apply(actorOf(req), id, applySchema.parse(req.body)));
}

export async function listApplicationsHandler(req: Request, res: Response) {
  ok(res, await service.listApplications(actorOf(req), appQuery.parse(req.query)));
}

export async function decideApplicationHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.decideApplication(actorOf(req), id, decideApplicationSchema.parse(req.body)));
}

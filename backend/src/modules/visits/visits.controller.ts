import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  createVisitSchema, updateVisitSchema, completeVisitSchema, cancelVisitSchema,
} from './visits.schema';
import * as service from './visits.service';

const idParam = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  placementId:  z.string().uuid().optional(),
  upcomingOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listHandler(req: Request, res: Response) {
  const q = listQuery.parse(req.query);
  ok(res, await service.listVisits(actorOf(req), q));
}

export async function createHandler(req: Request, res: Response) {
  created(res, await service.createVisit(actorOf(req), createVisitSchema.parse(req.body)));
}

export async function updateHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.updateVisit(actorOf(req), id, updateVisitSchema.parse(req.body)));
}

export async function completeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.completeVisit(actorOf(req), id, completeVisitSchema.parse(req.body)));
}

export async function cancelHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.cancelVisit(actorOf(req), id, cancelVisitSchema.parse(req.body)));
}

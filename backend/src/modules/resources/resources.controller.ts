import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import { createResourceSchema } from './resources.schema';
import * as service from './resources.service';

const idParam = z.object({ id: z.string().uuid() });
const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listHandler(req: Request, res: Response) {
  ok(res, await service.listResources(actorOf(req)));
}

export async function createHandler(req: Request, res: Response) {
  created(res, await service.createResource(actorOf(req), createResourceSchema.parse(req.body)));
}

export async function archiveHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.archiveResource(actorOf(req), id));
}

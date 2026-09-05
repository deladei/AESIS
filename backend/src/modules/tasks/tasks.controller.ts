import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import { createTaskSchema, updateTaskSchema } from './tasks.schema';
import * as service from './tasks.service';

// Route params are validated like every other module's — never trusted raw.
const idParam = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  placementId: z.string().uuid().optional(),
  assigneeId:  z.string().uuid().optional(),
});

const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listHandler(req: Request, res: Response) {
  const q = listQuerySchema.parse(req.query);
  ok(res, await service.listTasks(actorOf(req), q));
}

export async function createHandler(req: Request, res: Response) {
  const input = createTaskSchema.parse(req.body);
  created(res, await service.createTask(actorOf(req), input));
}

export async function updateHandler(req: Request, res: Response) {
  const input = updateTaskSchema.parse(req.body);
  const { id } = idParam.parse(req.params);
  ok(res, await service.updateTask(actorOf(req), id, input));
}

export async function removeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.deleteTask(actorOf(req), id));
}

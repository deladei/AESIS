import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import { AppError } from '../../middleware/errorHandler';
import { assignWorkSchema, createTaskSchema, updateTaskSchema } from './tasks.schema';
import * as service from './tasks.service';

// Route params are validated like every other module's — never trusted raw.
const idParam = z.object({ id: z.string().uuid() });
const attachmentParams = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });

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

// ── Setting work for several students at once ─────────────────

/**
 * Multipart, because the brief travels with the assignment rather than in a
 * second request — a half-set assignment with no attachment is a worse state
 * to leave behind than a slightly larger request.
 *
 * Same limits and allow-list as message and entry attachments; the multer
 * instance lives in the router next to them.
 */
export async function assignWorkHandler(req: Request, res: Response) {
  // Everything arrives as a string on the wire. `assigneeIds` is sent as JSON
  // so one student and ten look identical to the parser.
  let assigneeIds: unknown;
  try {
    assigneeIds = JSON.parse((req.body.assigneeIds as string) ?? '[]');
  } catch {
    throw new AppError(400, 'assigneeIds must be a JSON array of student ids');
  }

  const input = assignWorkSchema.parse({ ...req.body, assigneeIds });
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];

  const data = await service.assignWork(
    { id: req.user!.sub, role: req.user!.role },
    input,
    files,
  );
  return created(res, data);
}

export async function removeTaskAttachmentHandler(req: Request, res: Response) {
  const { id, attachmentId } = attachmentParams.parse(req.params);
  const data = await service.removeTaskAttachment(
    { id: req.user!.sub, role: req.user!.role },
    id,
    attachmentId,
  );
  return ok(res, data);
}

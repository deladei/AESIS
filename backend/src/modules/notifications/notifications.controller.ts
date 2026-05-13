import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, noContent } from '../../shared/utils/response';
import { uuidParam } from '../../shared/validators/common';
import * as service from './notifications.service';

const listQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

export async function list(req: Request, res: Response) {
  const { page, limit, unreadOnly } = listQuerySchema.parse(req.query);
  const result = await service.listNotifications(req.user!.sub, { page, limit, unreadOnly });
  ok(res, result);
}

export async function unreadCount(req: Request, res: Response) {
  const count = await service.getUnreadCount(req.user!.sub);
  ok(res, { count });
}

export async function markOneRead(req: Request, res: Response) {
  const { id } = uuidParam.parse(req.params);
  await service.markRead(id, req.user!.sub);
  noContent(res);
}

export async function markAllRead(req: Request, res: Response) {
  const result = await service.markAllRead(req.user!.sub);
  ok(res, result);
}

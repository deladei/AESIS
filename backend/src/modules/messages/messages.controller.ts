import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import * as messages from './messages.service';

const placementParam = z.object({ placementId: z.string().uuid() });
const postBody = z.object({ body: z.string().min(1, 'Message cannot be empty').max(4000) });

function actorOf(req: Request): messages.Actor {
  return { id: req.user!.sub, role: req.user!.role };
}

export async function listThreadHandler(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const thread = await messages.listThread(actorOf(req), placementId);
  return ok(res, { messages: thread });
}

export async function postMessageHandler(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const { body } = postBody.parse(req.body);
  const message = await messages.postMessage(actorOf(req), placementId, body);
  return created(res, { message });
}

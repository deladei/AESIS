import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  saveDraftSchema,
  returnSchema,
  rejectSchema,
  acknowledgeSchema,
  listQuerySchema,
} from './entries.schema';
import {
  saveDraft,
  submitEntry,
  acknowledgeEntry,
  returnEntry,
  rejectEntry,
  getEntry,
  getEntryTrail,
  listEntries,
} from './entries.service';
import type { Actor } from './entries.policy';
import type { EntryRole } from './entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });

// req.user is set by authenticate middleware ({ sub, role }).
function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

export async function saveDraftHandler(req: Request, res: Response) {
  const input = saveDraftSchema.parse(req.body);
  const entry = await saveDraft(actorOf(req), input);
  return created(res, entry);
}

export async function submitHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const entry = await submitEntry(actorOf(req), id);
  return ok(res, entry);
}

export async function acknowledgeHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = acknowledgeSchema.parse(req.body ?? {});
  const entry = await acknowledgeEntry(actorOf(req), id, input);
  return ok(res, entry);
}

export async function returnHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = returnSchema.parse(req.body);
  const entry = await returnEntry(actorOf(req), id, input);
  return ok(res, entry);
}

export async function rejectHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const input = rejectSchema.parse(req.body);
  const entry = await rejectEntry(actorOf(req), id, input);
  return ok(res, entry);
}

export async function getEntryHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const entry = await getEntry(actorOf(req), id);
  return ok(res, entry);
}

export async function getTrailHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const trail = await getEntryTrail(actorOf(req), id);
  return ok(res, trail);
}

export async function listEntriesHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const { entries, meta } = await listEntries(actorOf(req), query);
  return ok(res, entries, meta);
}

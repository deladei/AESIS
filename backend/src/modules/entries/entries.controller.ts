import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  saveDraftSchema,
  returnSchema,
  acknowledgeSchema,
  listQuerySchema,
  saveDaySchema,
  submitDaySchema,
} from './entries.schema';
import {
  saveDraft,
  submitEntry,
  acknowledgeEntry,
  returnEntry,
  getEntry,
  getEntryTrail,
  listEntries,
  getReviewStats,
} from './entries.service';
import { saveDayDraft, submitDay } from './entries.day.service';
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

// ── Per-day path ──────────────────────────────────────────────

export async function saveDayHandler(req: Request, res: Response) {
  const input = saveDaySchema.parse(req.body);
  const entry = await saveDayDraft(actorOf(req), input);
  return created(res, entry);
}

export async function submitDayHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { date } = submitDaySchema.parse(req.body);
  const entry = await submitDay(actorOf(req), id, date);
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

export async function reviewStatsHandler(req: Request, res: Response) {
  const stats = await getReviewStats(actorOf(req));
  return ok(res, stats);
}

export async function listEntriesHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  const { entries, meta } = await listEntries(actorOf(req), query);
  return ok(res, entries, meta);
}

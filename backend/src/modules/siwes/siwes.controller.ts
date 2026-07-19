import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import {
  saveDailyEntrySchema,
  saveWeeklySummarySchema,
  recordAbsenceSchema,
  createNonWorkingDaySchema,
  listNonWorkingDaysQuerySchema,
  calendarQuerySchema,
} from './siwes.schema';
import {
  saveDailyEntry,
  saveWeeklySummary,
  recordAbsence,
  createNonWorkingDay,
  listNonWorkingDays,
  deleteNonWorkingDay,
  getLogbookCalendar,
} from './siwes.service';
import type { Actor } from '../entries/entries.policy';
import type { EntryRole } from '../entries/entry.stateMachine';

const idParam = z.object({ id: z.string().uuid() });
const placementParam = z.object({ placementId: z.string().uuid() });

// req.user is set by authenticate middleware ({ sub, role }).
function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

export async function saveDailyEntryHandler(req: Request, res: Response) {
  const input = saveDailyEntrySchema.parse(req.body);
  const entry = await saveDailyEntry(actorOf(req), input);
  return ok(res, entry);
}

export async function saveWeeklySummaryHandler(req: Request, res: Response) {
  const input = saveWeeklySummarySchema.parse(req.body);
  const summary = await saveWeeklySummary(actorOf(req), input);
  return ok(res, summary);
}

export async function recordAbsenceHandler(req: Request, res: Response) {
  const input = recordAbsenceSchema.parse(req.body);
  const absence = await recordAbsence(actorOf(req), input);
  return created(res, absence);
}

export async function getLogbookCalendarHandler(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const query = calendarQuerySchema.parse(req.query);
  const calendar = await getLogbookCalendar(actorOf(req), placementId, query);
  return ok(res, calendar);
}

export async function createNonWorkingDayHandler(req: Request, res: Response) {
  const input = createNonWorkingDaySchema.parse(req.body);
  const day = await createNonWorkingDay(input);
  return created(res, day);
}

export async function listNonWorkingDaysHandler(req: Request, res: Response) {
  const { academicYearId } = listNonWorkingDaysQuerySchema.parse(req.query);
  const days = await listNonWorkingDays(academicYearId);
  return ok(res, days);
}

export async function deleteNonWorkingDayHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  await deleteNonWorkingDay(id);
  return ok(res, { deleted: true });
}

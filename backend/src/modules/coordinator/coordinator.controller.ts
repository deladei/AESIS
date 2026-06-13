import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import * as service from './coordinator.service';
import { updateCohortConfigSchema } from './coordinator.schema';

const studentsQuerySchema = z.object({
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  riskTier:       z.enum(['low', 'medium', 'high']).optional(),
  programmeId:    z.string().uuid().optional(),
  supervisorId:   z.union([z.literal('unassigned'), z.string().uuid()]).optional(),
  academicYearId: z.string().uuid().optional(),
  status:         z.enum(['draft', 'submitted', 'returned', 'acknowledged', 'rejected', 'not_started']).optional(),
  sortBy:         z.enum(['name', 'department', 'supervisor', 'progress', 'score', 'status']).optional(),
  sortDir:        z.enum(['asc', 'desc']).optional(),
});

export async function dashboard(_req: Request, res: Response) {
  const data = await service.getCoordinatorDashboard();
  ok(res, data);
}

export async function students(req: Request, res: Response) {
  const filters = studentsQuerySchema.parse(req.query);
  const result = await service.listStudents(filters);
  ok(res, result);
}

export async function studentDetail(req: Request, res: Response) {
  const placementId = z.string().uuid().parse(req.params.placementId);
  const data = await service.getStudentDetail(placementId);
  ok(res, data);
}

const messageSchema = z.object({ message: z.string().trim().min(1).max(2000) });

export async function messageStudent(req: Request, res: Response) {
  const placementId = z.string().uuid().parse(req.params.placementId);
  const { message } = messageSchema.parse(req.body);
  ok(res, await service.messageStudent(placementId, req.user!.sub, message));
}

export async function remindStudent(req: Request, res: Response) {
  const placementId = z.string().uuid().parse(req.params.placementId);
  ok(res, await service.remindStudent(placementId, req.user!.sub));
}

const bulkSchema       = z.object({ placementIds: z.array(z.string().uuid()).min(1).max(200) });
const bulkAssignSchema = bulkSchema.extend({ supervisorId: z.string().uuid() });

export async function bulkReminder(req: Request, res: Response) {
  const { placementIds } = bulkSchema.parse(req.body);
  ok(res, await service.bulkRemind(placementIds, req.user!.sub));
}

export async function bulkAssign(req: Request, res: Response) {
  const { placementIds, supervisorId } = bulkAssignSchema.parse(req.body);
  ok(res, await service.bulkAssignSupervisor(placementIds, req.user!.sub, supervisorId));
}

export async function exportCsv(req: Request, res: Response) {
  const raw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = raw ? raw.split(',').filter(Boolean) : undefined;
  const csv = await service.exportStudentsCsv({ ids });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="interns.csv"');
  res.send(csv);
}

export async function programmes(_req: Request, res: Response) {
  ok(res, await service.listProgrammes());
}

export async function cohorts(_req: Request, res: Response) {
  ok(res, await service.listCohorts());
}

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

export async function activity(req: Request, res: Response) {
  const { limit } = activityQuerySchema.parse(req.query);
  const data = await service.getRecentActivity(limit);
  ok(res, data);
}

export async function supervisors(_req: Request, res: Response) {
  const data = await service.listSupervisors();
  ok(res, data);
}

export async function oversight(_req: Request, res: Response) {
  const data = await service.getOversight();
  ok(res, data);
}

export async function cohortConfig(_req: Request, res: Response) {
  const data = await service.getActiveCohortConfig();
  ok(res, data);
}

export async function updateCohortConfig(req: Request, res: Response) {
  const input = updateCohortConfigSchema.parse(req.body);
  const data = await service.updateActiveCohortConfig(input);
  ok(res, data);
}

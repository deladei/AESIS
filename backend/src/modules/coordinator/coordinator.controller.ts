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

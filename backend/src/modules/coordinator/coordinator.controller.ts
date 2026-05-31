import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import * as service from './coordinator.service';

const studentsQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  riskTier: z.enum(['low', 'medium', 'high']).optional(),
});

export async function dashboard(_req: Request, res: Response) {
  const data = await service.getCoordinatorDashboard();
  ok(res, data);
}

export async function students(req: Request, res: Response) {
  const { page, limit, riskTier } = studentsQuerySchema.parse(req.query);
  const result = await service.listStudents({ page, limit, riskTier });
  ok(res, result);
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

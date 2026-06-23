import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import * as service from './coordinator.service';
import { updateCohortConfigSchema } from './coordinator.schema';
import { REGION_VALUES } from '../../shared/constants/regions';

const studentsQuerySchema = z.object({
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  riskTier:       z.enum(['low', 'medium', 'high']).optional(),
  programmeId:    z.string().uuid().optional(),
  supervisorId:   z.union([z.literal('unassigned'), z.string().uuid()]).optional(),
  academicYearId: z.string().uuid().optional(),
  status:         z.enum(['draft', 'submitted', 'returned', 'acknowledged', 'not_started']).optional(),
  attention:      z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  sortBy:         z.enum(['name', 'department', 'supervisor', 'progress', 'score', 'status']).optional(),
  sortDir:        z.enum(['asc', 'desc']).optional(),
});

// Optional cohort scope shared by the dashboard, export, and the workload /
// distribution panels (item 17).
const cohortScopeSchema = z.object({ academicYearId: z.string().uuid().optional() });

export async function dashboard(req: Request, res: Response) {
  const { academicYearId } = cohortScopeSchema.parse(req.query);
  const data = await service.getCoordinatorDashboard({ academicYearId });
  ok(res, data);
}

export async function supervisorWorkload(req: Request, res: Response) {
  const { academicYearId } = cohortScopeSchema.parse(req.query);
  ok(res, await service.getSupervisorWorkload({ academicYearId }));
}

export async function performanceDistribution(req: Request, res: Response) {
  const { academicYearId } = cohortScopeSchema.parse(req.query);
  ok(res, await service.getPerformanceDistribution({ academicYearId }));
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

const flagSchema = z.object({ flagged: z.boolean(), reason: z.string().trim().max(500).optional() });

export async function setFlag(req: Request, res: Response) {
  const placementId = z.string().uuid().parse(req.params.placementId);
  const { flagged, reason } = flagSchema.parse(req.body);
  ok(res, await service.setFlag(placementId, req.user!.sub, flagged, reason));
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
  const { academicYearId } = cohortScopeSchema.parse(req.query);
  const csv = await service.exportStudentsCsv({ ids, academicYearId });
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

// region is nullable so the coordinator can clear a supervisor's region too.
const setRegionSchema = z.object({ region: z.enum(REGION_VALUES).nullable() });

export async function setSupervisorRegion(req: Request, res: Response) {
  const { region } = setRegionSchema.parse(req.body);
  const data = await service.setSupervisorRegion(String(req.params.id), region);
  ok(res, data);
}

export async function unassignedPlacements(_req: Request, res: Response) {
  const data = await service.listUnassignedPlacements();
  ok(res, data);
}

const searchQuerySchema = z.object({ q: z.string().default('') });

export async function search(req: Request, res: Response) {
  const { q } = searchQuerySchema.parse(req.query);
  ok(res, await service.searchEntities(q));
}

export async function featureFlags(_req: Request, res: Response) {
  ok(res, service.getFeatureFlags());
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

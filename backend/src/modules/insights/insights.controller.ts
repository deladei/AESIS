import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './insights.service';

/** Supervisors are scoped to their own placements; coordinator/admin see all. */
function scopeFor(req: Request): service.InsightsScope {
  return req.user!.role === 'academic_supervisor'
    ? { supervisorId: req.user!.sub }
    : {};
}

export async function insights(req: Request, res: Response) {
  ok(res, await service.getInsights(scopeFor(req)));
}

export async function interns(req: Request, res: Response) {
  ok(res, await service.listInternsForFeedback(scopeFor(req)));
}

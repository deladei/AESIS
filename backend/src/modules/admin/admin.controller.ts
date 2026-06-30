import { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import * as service from './admin.service';
import { getEnrichmentHealth, reviveEnrichment } from '../entries/enrichment.admin';

export async function dashboard(_req: Request, res: Response) {
  const data = await service.getAdminDashboard();
  ok(res, data);
}

// AI enrichment pipeline health (queue status counts).
export async function enrichmentHealth(_req: Request, res: Response) {
  ok(res, await getEnrichmentHealth());
}

// Revive abandoned/failed enrichment jobs so the worker re-runs them against a
// now-healthy engine.
export async function enrichmentRevive(_req: Request, res: Response) {
  ok(res, await reviveEnrichment());
}

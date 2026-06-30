import { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/utils/response';
import * as service from './admin.service';
import { getEnrichmentHealth, reviveEnrichment } from '../entries/enrichment.admin';

const placementParam = z.object({ placementId: z.string().uuid() });
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const scheduleCallSchema = z.object({
  scheduledAt: z.string().datetime(),
  topic: z.string().trim().min(1).max(200),
  meetLink: z.string().trim().url().max(500),
});

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

// ── Messaging ─────────────────────────────────────────────────

export async function messageableInterns(_req: Request, res: Response) {
  ok(res, await service.listMessageableInterns());
}

export async function messageIntern(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const { body } = messageSchema.parse(req.body);
  ok(res, await service.messageIntern(placementId, body));
}

export async function scheduleCall(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const input = scheduleCallSchema.parse(req.body);
  ok(res, await service.scheduleCallWithIntern(placementId, input));
}

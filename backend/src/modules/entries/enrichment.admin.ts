import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';

// Admin/ops control over the advisory AI-enrichment pipeline. When the AI engine
// is down (Render free/starter cold-sleeps, or an outage), jobs exhaust their
// retries and land in 'abandoned' — terminal, never picked up again — so
// ai_assessment stops populating and every AI-relevance surface goes blank.
// These helpers expose the queue health and let abandoned/failed jobs be revived
// once the engine is healthy again (the worker then re-processes them).

export type EnrichmentHealth = {
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
  abandoned: number;
  total: number;
  /** Jobs that can be revived right now (abandoned + failed). */
  revivable: number;
};

const ZERO: Record<string, number> = {
  pending: 0, processing: 0, succeeded: 0, failed: 0, abandoned: 0,
};

export async function getEnrichmentHealth(): Promise<EnrichmentHealth> {
  const groups = await prisma.enrichmentQueue.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const counts = { ...ZERO };
  let total = 0;
  for (const g of groups) {
    counts[g.status] = g._count._all;
    total += g._count._all;
  }
  return {
    pending: counts.pending,
    processing: counts.processing,
    succeeded: counts.succeeded,
    failed: counts.failed,
    abandoned: counts.abandoned,
    total,
    revivable: counts.abandoned + counts.failed,
  };
}

/**
 * Reset abandoned + failed enrichment jobs back to 'pending' (attempts cleared,
 * due now) so the worker re-processes them against a now-healthy engine. Safe and
 * idempotent — enrichment is advisory and re-runnable; a job that still can't
 * reach the engine simply re-abandons after its retries. Returns the count revived.
 */
export async function reviveEnrichment(): Promise<{ revived: number }> {
  const r = await prisma.enrichmentQueue.updateMany({
    where: { status: { in: ['abandoned', 'failed'] } },
    data: { status: 'pending', attempts: 0, nextRunAt: new Date(), lockedAt: null, lastError: null },
  });
  if (r.count > 0) logger.info('Enrichment jobs revived to pending', { revived: r.count });
  return { revived: r.count };
}

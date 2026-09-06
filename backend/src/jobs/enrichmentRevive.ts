import cron from 'node-cron';
import { logger } from '../config/logger';
import { reviveEnrichment } from '../modules/entries/enrichment.admin';

// Self-heal for the advisory AI-enrichment pipeline. When the AI engine is down
// (Render cold-sleep or an outage), jobs exhaust their retries and land in
// 'abandoned' — terminal, never picked up again — so ai_assessment stops
// populating. This re-enqueues abandoned/failed jobs on a schedule so the
// pipeline recovers on its own once the engine is healthy, without anyone
// having to click "revive" in the admin panel.
async function runRevive(): Promise<void> {
  try {
    const { revived } = await reviveEnrichment();
    if (revived > 0) logger.info('CRON: enrichment self-heal revived stuck jobs', { revived });
  } catch (err) {
    logger.error('CRON: enrichment self-heal failed', { err });
  }
}

export function startEnrichmentReviveJob(): void {
  // Every 6 hours. Failed jobs already retry via backoff; this rescues the
  // abandoned ones a handful of times a day — cheap and safe (enrichment is
  // advisory and idempotent).
  cron.schedule('0 */6 * * *', runRevive, { timezone: 'Africa/Accra' });
  logger.info('CRON: enrichment self-heal scheduled (every 6h)');
}

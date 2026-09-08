import cron from 'node-cron';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { aiEngineUrl } from '../shared/utils/aiEngine';

/**
 * Keep the AI engine awake.
 *
 * `aesis-ai-engine` runs on a Render plan that suspends the service after a
 * stretch of no traffic, and waking it takes 30–60 seconds — it loads a
 * sentence-transformer model on boot. The assistant's own timeouts are shorter
 * than that on purpose (nobody should stare at a spinner for a minute), so the
 * first question after a quiet period reliably answered "temporarily
 * unavailable" even though nothing was actually wrong. The engine was asleep,
 * and asking it a question was the only thing that ever woke it.
 *
 * A cheap unauthenticated GET on `/health` every few minutes keeps it up, so
 * the first real question of the day is answered rather than refused.
 *
 * This is a workaround for a hosting plan, not a fix for a bug, and it is
 * honest about that: on a plan that does not suspend, it is harmless noise.
 */

/** Comfortably inside the idle window that triggers suspension. */
const PING_CRON = '*/10 * * * *';

/** Long enough to survive a cold start, so the ping that finds it asleep is
 *  also the ping that wakes it rather than timing out and leaving it down. */
const PING_TIMEOUT_MS = 90_000;

let lastWarm: string | null = null;

export async function pingAiEngine(): Promise<boolean> {
  const started = Date.now();
  try {
    const res = await fetch(aiEngineUrl('/health'), {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    const ms = Date.now() - started;

    if (!res.ok) {
      logger.warn('CRON: AI engine keep-warm got a bad status', { status: res.status, ms });
      return false;
    }

    // A slow reply means this ping WOKE it, which is worth seeing in the log —
    // it is the difference between "the plan is suspending us" and "the engine
    // is unhealthy", and those have different fixes.
    if (ms > 10_000) {
      logger.info('CRON: AI engine was asleep and has been woken', { ms });
    }

    lastWarm = new Date().toISOString();
    return true;
  } catch (err) {
    logger.warn('CRON: AI engine keep-warm failed', {
      ms: Date.now() - started,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** When the engine was last confirmed awake, for the status endpoint. */
export function lastKeptWarmAt(): string | null {
  return lastWarm;
}

export function startAiEngineKeepWarm(): void {
  // `AI_ENGINE_URL` always has a value (it defaults to localhost), so there is
  // nothing to guard on there. Tests are the real exclusion: a scheduled fetch
  // outlives the suite and leaves Jest hanging on an open handle.
  if (env.NODE_ENV === 'test') return;

  // Once at boot as well as on the schedule: a deploy is exactly when someone
  // is about to use the thing, and waiting ten minutes for the first tick
  // would leave that first question to time out.
  void pingAiEngine();

  cron.schedule(PING_CRON, () => { void pingAiEngine(); }, { timezone: 'Africa/Accra' });
  logger.info('CRON: AI engine keep-warm scheduled (every 10m)');
}

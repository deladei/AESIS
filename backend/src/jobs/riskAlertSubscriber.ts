import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { emitToUser } from '../shared/utils/socketEmitter';

// Redis pub/sub channel is namespaced so this app can share a Redis instance
// with other projects without cross-talk. The Socket.io event name pushed to
// the frontend stays `risk_alert` — that contract is independent of Redis.
const CHANNEL = 'aesis:risk_alert';

/**
 * Subscribes to the Redis `aesis:risk_alert` pub/sub channel published by the
 * Python AI Celery task and forwards each message to the relevant supervisor
 * via Socket.io.
 *
 * Expected payload shape (JSON):
 *   { supervisorId, studentId, placementId, tier, factors }
 */
export function startRiskAlertSubscriber(): void {
  const subscriber = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  subscriber.on('error', (err) => {
    logger.error('riskAlertSubscriber: Redis error', { err });
  });

  subscriber.subscribe(CHANNEL, (err, count) => {
    if (err) {
      logger.error('riskAlertSubscriber: subscribe failed', { err });
      return;
    }
    logger.info('riskAlertSubscriber: subscribed', { channel: CHANNEL, count });
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(message);
    } catch {
      logger.warn('riskAlertSubscriber: invalid JSON — skipping', { message });
      return;
    }

    const supervisorId = payload.supervisorId as string | undefined;
    if (!supervisorId) {
      logger.warn('riskAlertSubscriber: missing supervisorId — skipping', { payload });
      return;
    }

    emitToUser(supervisorId, 'risk_alert', payload);
    logger.info('riskAlertSubscriber: risk_alert forwarded', { supervisorId, tier: payload.tier });
  });
}

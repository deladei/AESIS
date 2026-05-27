import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let redis: Redis;

export function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(env.REDIS_URL, {
    // null = queue commands across reconnects instead of failing them after N retries.
    // Avoids unhandled-rejection crashes when Upstash drops idle connections.
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
    lazyConnect: true,
    enableOfflineQueue: true,
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
  redis.on('end', () => logger.warn('Redis connection ended'));

  return redis;
}

export async function connectRedis() {
  const r = getRedis();
  await r.connect().catch(() => {}); // lazyConnect — connect() resolves even if already connected
}

export async function disconnectRedis() {
  if (redis) await redis.quit();
}

// Key builders — consistent naming across the app.
// All keys are namespaced under `aesis:` so this app can share a Redis
// instance with other projects without colliding on generic keys
// (refresh:, session:, risk:, …).
export const RedisKey = {
  refreshToken:  (userId: string) => `aesis:refresh:${userId}`,
  tfidfCache:    (submissionId: string) => `aesis:tfidf:${submissionId}`,
  riskCache:     (studentId: string) => `aesis:risk:${studentId}`,
  session:       (userId: string) => `aesis:session:${userId}`,
  rateLimit:     (ip: string) => `aesis:rl:${ip}`,
} as const;

export const TTL = {
  session:    60 * 15,          // 15 min
  tfidf:      60 * 60 * 24,     // 24h
  risk:       60 * 60 * 24 * 7, // 7 days
} as const;

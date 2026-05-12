import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let redis: Redis;

export function getRedis(): Redis {
  if (redis) return redis;

  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: true,
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

  return redis;
}

export async function connectRedis() {
  const r = getRedis();
  await r.connect().catch(() => {}); // lazyConnect — connect() resolves even if already connected
}

export async function disconnectRedis() {
  if (redis) await redis.quit();
}

// Key builders — consistent naming across the app
export const RedisKey = {
  refreshToken:  (userId: string) => `refresh:${userId}`,
  tfidfCache:    (submissionId: string) => `tfidf:${submissionId}`,
  riskCache:     (studentId: string) => `risk:${studentId}`,
  session:       (userId: string) => `session:${userId}`,
  rateLimit:     (ip: string) => `rl:${ip}`,
} as const;

export const TTL = {
  session:    60 * 15,          // 15 min
  tfidf:      60 * 60 * 24,     // 24h
  risk:       60 * 60 * 24 * 7, // 7 days
} as const;

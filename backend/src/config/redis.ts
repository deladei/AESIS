import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let redis: Redis;

// Diagnostic: describe the REDIS_URL the process actually received WITHOUT
// leaking the password. Confirms scheme (rediss = TLS), host, port at runtime —
// catches a wrong value, trailing whitespace, or the var being set on the wrong
// service. Falls back to a raw-prefix view if the string isn't a valid URL.
function describeRedisUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    return {
      scheme: u.protocol.replace(':', ''),
      tls: u.protocol === 'rediss:',
      host: u.hostname,
      port: u.port || '(default)',
      hasPassword: u.password.length > 0,
      passwordLen: u.password.length,
      rawHadWhitespace: raw !== raw.trim(),
    };
  } catch {
    return { unparseable: true, prefix: raw.slice(0, 12), length: raw.length };
  }
}

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

  // NOTE: 'connect' fires on raw TCP connect — BEFORE the TLS handshake + AUTH.
  // It does NOT mean the client can run commands. 'ready' is the real signal.
  redis.on('connect', () => logger.info('Redis TCP connect (not yet ready)'));
  redis.on('ready', () => logger.info('Redis READY — commands can run'));
  redis.on('reconnecting', (delay: number) =>
    logger.warn('Redis reconnecting', { delayMs: delay }));
  redis.on('error', (err: NodeJS.ErrnoException) =>
    logger.error('Redis error', { name: err.name, code: err.code, message: err.message }));
  redis.on('end', () => logger.warn('Redis connection ended'));

  return redis;
}

export async function connectRedis() {
  logger.info('Redis config', describeRedisUrl(env.REDIS_URL));

  const r = getRedis();
  await r.connect().catch((err: Error) =>
    logger.error('Redis connect() rejected', { message: err.message }));

  // Boot self-test: prove the client can actually round-trip a command.
  // Raced against a timeout because offline-queued commands hang indefinitely
  // when the client is stuck pre-'ready' (the exact failure we're chasing).
  const t0 = Date.now();
  try {
    const pong = await Promise.race([
      r.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ping-timeout-3s')), 3000)),
    ]);
    logger.info('Redis PING ok', { reply: pong, latencyMs: Date.now() - t0 });
  } catch (err) {
    logger.error('Redis PING FAILED', {
      message: (err as Error).message,
      afterMs: Date.now() - t0,
      status: r.status,
    });
  }
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

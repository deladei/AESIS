import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis';

// The Redis client is configured to queue commands across reconnects
// (maxRetriesPerRequest: null + offline queue) so it never throws — good for
// crash-safety, but it means a command issued while Redis is unreachable waits
// forever. Race every store command against a short timeout so a Redis outage
// surfaces as a store error (handled by passOnStoreError below) instead of
// hanging the request indefinitely.
const REDIS_CMD_TIMEOUT_MS = 1_500;

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) =>
      Promise.race([
        (getRedis() as any).call(...args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('redis-command-timeout')), REDIS_CMD_TIMEOUT_MS),
        ),
      ]),
    prefix,
  });
}

// AI chat / inference: 30 req / 15 min / IP — Groq free tier is 14.4k req/day.
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore('aesis:rl:ai:'),
  // Fail open: if Redis is unreachable the store command rejects (see timeout
  // above) and the request is allowed through unthrottled rather than 500ing or
  // hanging. Rate limiting is best-effort; a cache outage must not take the
  // chatbot down. Logged by express-rate-limit when it happens.
  passOnStoreError: true,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many AI requests. Please wait a few minutes and try again.',
  },
});

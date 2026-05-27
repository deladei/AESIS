import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis';

function makeStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => (getRedis() as any).call(...args),
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
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many AI requests. Please wait a few minutes and try again.',
  },
});

import rateLimit from 'express-rate-limit';

// Global: 100 req / 15 min / IP
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  },
});

// Auth endpoints: tighter — 10 attempts / 15 min / IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
});

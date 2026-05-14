import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { globalRateLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { globalErrorHandler } from './middleware/errorHandler';
import { env } from './config/env';

import authRouter          from './modules/auth/auth.router';
import placementsRouter    from './modules/placements/placements.router';
import companiesRouter     from './modules/placements/companies.router';
import logbookRouter       from './modules/logbook/logbook.router';
import notificationsRouter from './modules/notifications/notifications.router';
import coordinatorRouter   from './modules/coordinator/coordinator.router';
import supervisorRouter    from './modules/supervisor/supervisor.router';
import aiRouter            from './modules/ai/ai.router';
// Future phases — uncomment as modules are built:
// import usersRouter        from './modules/users/users.router';

export function createApp() {
  const app = express();

  // ── Security headers ──────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'blob:'],
        connectSrc:  ["'self'"],
        fontSrc:     ["'self'"],
        objectSrc:   ["'none'"],
        frameAncestors: ["'none'"],
        ...(env.NODE_ENV === 'production' && { upgradeInsecureRequests: [] }),
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ── CORS ──────────────────────────────────────────────────────
  app.use(cors({
    origin:       env.FRONTEND_URL,
    credentials:  true,
    methods:      ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Body parsing ──────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Cookie parsing (required for HttpOnly refresh token) ──────
  app.use(cookieParser());

  // ── Logging ───────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health check (before rate limiter — must not be throttled by load balancers/Docker) ──
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aesis-api', timestamp: new Date().toISOString() });
  });

  // ── Global rate limiter ───────────────────────────────────────
  app.use(globalRateLimiter);

  // ── API routes ────────────────────────────────────────────────
  app.use('/api/v1/auth',          authRouter);
  app.use('/api/v1/placements',    placementsRouter);
  app.use('/api/v1/companies',     companiesRouter);
  app.use('/api/v1/logbook',       logbookRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/coordinator',   coordinatorRouter);
  app.use('/api/v1/supervisor',    supervisorRouter);
  app.use('/api/v1/ai',            aiRouter);
  // Future phases — uncomment as modules are built:
  // app.use('/api/v1/users',         usersRouter);

  // ── 404 catch-all ─────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ status: 'error', code: 'NOT_FOUND', message: 'Route not found' });
  });

  // ── Global error handler (must be last) ───────────────────────
  app.use(globalErrorHandler);

  return app;
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestLogger } from './middleware/requestLogger';
import { globalErrorHandler } from './middleware/errorHandler';
import { env } from './config/env';

import authRouter          from './modules/auth/auth.router';
import placementsRouter    from './modules/placements/placements.router';
import companiesRouter     from './modules/placements/companies.router';
import logbookRouter       from './modules/logbook/logbook.router';
import entriesRouter       from './modules/entries/entries.router';
import objectivesPlacementRouter from './modules/objectives/objectives.placement.router';
import messagesRouter      from './modules/messages/messages.router';
import objectivesEntryRouter     from './modules/objectives/objectives.entry.router';
import finalizationRouter  from './modules/finalization/finalization.router';
import attestPublicRouter  from './modules/finalization/attestation.public.router';
import gradesRouter        from './modules/grades/grades.router';
import gradesPublicRouter  from './modules/grades/grades.public.router';
import notificationsRouter from './modules/notifications/notifications.router';
import coordinatorRouter   from './modules/coordinator/coordinator.router';
import supervisorRouter    from './modules/supervisor/supervisor.router';
import studentRouter       from './modules/student/student.router';
import insightsRouter      from './modules/insights/insights.router';
import adminRouter         from './modules/admin/admin.router';
import aiRouter            from './modules/ai/ai.router';
import riskRouter          from './modules/risk/risk.router';
import industryRouter      from './modules/industry/industry.router';
import industryPlacementRouter from './modules/industry/industry.placement.router';
import industryPublicRouter from './modules/industry/industry.public.router';
// Future phases — uncomment as modules are built:
// import usersRouter        from './modules/users/users.router';

export function createApp() {
  const app = express();

  // Render terminates TLS at its edge and forwards over HTTP; trust the proxy
  // so req.secure / req.ip reflect the original request (needed for Secure
  // cookies and correct per-client rate limiting in prod).
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

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
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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

  // ── Health check ──────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aesis-api', timestamp: new Date().toISOString() });
  });

  // ── API routes ────────────────────────────────────────────────
  app.use('/api/v1/auth',          authRouter);
  app.use('/api/v1/placements',    placementsRouter);
  app.use('/api/v1/placements',    finalizationRouter); // assessment / finalize / attestation invite
  app.use('/api/v1/placements',    objectivesPlacementRouter); // learning objectives (define/list)
  app.use('/api/v1/placements',    messagesRouter); // two-way mentorship messaging thread
  app.use('/api/v1/placements',    industryPlacementRouter); // industry supervisor records (list/add)
  app.use('/api/v1/companies',     companiesRouter);
  app.use('/api/v1/logbook',       logbookRouter);
  app.use('/api/v1/entries',       entriesRouter);
  app.use('/api/v1/entries',       objectivesEntryRouter); // entry <-> objective links

  app.use('/api/v1/grades',        gradesRouter); // final-grade spine (aggregate/override/release)
  app.use('/api/v1/grade-invite',  gradesPublicRouter); // PUBLIC magic-link industry score
  app.use('/api/v1/attest',        attestPublicRouter); // PUBLIC magic-link attestation
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/coordinator',   coordinatorRouter);
  app.use('/api/v1/supervisor',    supervisorRouter);
  app.use('/api/v1/student',       studentRouter);
  app.use('/api/v1/insights',      insightsRouter);
  app.use('/api/v1/admin',         adminRouter);
  app.use('/api/v1/ai',            aiRouter);
  app.use('/api/v1/risk',          riskRouter); // advisory risk signals (entries data)
  app.use('/api/v1/industry-supervisors', industryRouter); // record edits + verification
  app.use('/api/v1/industry-form', industryPublicRouter); // PUBLIC magic-link 7-criterion form
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

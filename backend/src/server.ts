import http from 'http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma, disconnectPrisma } from './config/prisma';
import { connectMongo, disconnectMongo } from './config/mongo';
import { connectRedis, disconnectRedis } from './config/redis';
import { setIo } from './config/socket';
import { startDeadlineReminderJobs } from './jobs/deadlineReminder';
import { startWeeklyReportJob } from './jobs/weeklyReport';
import { startRiskAlertSubscriber } from './jobs/riskAlertSubscriber';

async function bootstrap() {
  // ── Connect all data stores before accepting traffic ──────────
  await connectRedis();
  await connectMongo(); // optional — server starts even if MongoDB is unavailable
  await prisma.$connect();
  logger.info('Core data stores connected (PostgreSQL + Redis)');

  const app = createApp();
  const httpServer = http.createServer(app);

  // ── Socket.io ─────────────────────────────────────────────────
  const io = new SocketServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    path: '/socket.io',
  });

  // JWT handshake authentication for WebSocket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('No token provided'));

    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.user?.sub;
    if (userId) {
      socket.join(`user:${userId}`);
      logger.debug(`Socket connected: user ${userId}`);
    }
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: user ${userId}`);
    });
  });

  // Register the io singleton so services/jobs can emit without circular deps
  setIo(io);

  // ── Background jobs ───────────────────────────────────────────
  startDeadlineReminderJobs();
  startWeeklyReportJob();
  startRiskAlertSubscriber();

  // ── Start server ──────────────────────────────────────────────
  httpServer.listen(env.PORT, () => {
    logger.info(`AESIS API running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    httpServer.close(async () => {
      await Promise.allSettled([
        disconnectPrisma(),
        disconnectMongo(),
        disconnectRedis(),
      ]);
      logger.info('Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

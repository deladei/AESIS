jest.mock('../config/env', () => ({
  env: {
    NODE_ENV:    'test',
    JWT_SECRET:  'test_secret_at_least_32_characters_long',
    FRONTEND_URL:'http://localhost:5173',
  },
}));

jest.mock('../config/prisma', () => ({
  prisma: { $queryRaw: jest.fn() },
}));

// Stub all routers used by createApp to avoid deep dependency loading
jest.mock('../modules/auth/auth.router',                  () => { const r = require('express').Router(); return r; });
jest.mock('../modules/placements/placements.router',      () => { const r = require('express').Router(); return r; });
jest.mock('../modules/placements/companies.router',       () => { const r = require('express').Router(); return r; });
jest.mock('../modules/notifications/notifications.router',() => { const r = require('express').Router(); return r; });
jest.mock('../modules/coordinator/coordinator.router',    () => { const r = require('express').Router(); return r; });
jest.mock('../modules/supervisor/supervisor.router',      () => { const r = require('express').Router(); return r; });
jest.mock('../modules/ai/ai.router',                     () => { const r = require('express').Router(); return r; });

import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../config/prisma';

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;

const app = createApp();

describe('createApp', () => {
  beforeEach(() => queryRaw.mockReset());

  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'aesis-api');
  });

  it('GET /health stays 200 even when Postgres is down (liveness, not readiness)', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health/db returns 200 when the DB round-trip succeeds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const res = await request(app).get('/health/db');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('db', 'up');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('GET /health/db returns 503 when the DB is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('Your account or project has exceeded the compute time quota'));
    const res = await request(app).get('/health/db');
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('db', 'down');
  });

  it('unknown routes return 404', async () => {
    const res = await request(app).get('/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('sets security headers via Helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

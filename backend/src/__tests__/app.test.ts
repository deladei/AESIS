jest.mock('../config/env', () => ({
  env: {
    NODE_ENV:    'test',
    JWT_SECRET:  'test_secret_at_least_32_characters_long',
    FRONTEND_URL:'http://localhost:5173',
  },
}));

// Stub all routers used by createApp to avoid deep dependency loading
jest.mock('../modules/auth/auth.router',                  () => { const r = require('express').Router(); return r; });
jest.mock('../modules/placements/placements.router',      () => { const r = require('express').Router(); return r; });
jest.mock('../modules/placements/companies.router',       () => { const r = require('express').Router(); return r; });
jest.mock('../modules/logbook/logbook.router',            () => { const r = require('express').Router(); return r; });
jest.mock('../modules/notifications/notifications.router',() => { const r = require('express').Router(); return r; });
jest.mock('../modules/coordinator/coordinator.router',    () => { const r = require('express').Router(); return r; });
jest.mock('../modules/supervisor/supervisor.router',      () => { const r = require('express').Router(); return r; });
jest.mock('../modules/ai/ai.router',                     () => { const r = require('express').Router(); return r; });

import request from 'supertest';
import { createApp } from '../app';

const app = createApp();

describe('createApp', () => {
  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'aesis-api');
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

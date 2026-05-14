jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
}));

jest.mock('../supervisor.service', () => ({
  getSupervisorDashboard: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import supervisorRouter from '../supervisor.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as service from '../supervisor.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET = 'test_secret_at_least_32_characters_long';

function token(role = 'academic_supervisor', sub = 'sup-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/supervisor', supervisorRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

describe('GET /supervisor/dashboard', () => {
  it('returns 200 with dashboard data', async () => {
    mockService.getSupervisorDashboard.mockResolvedValue({
      students:         [],
      pendingReviews:   0,
      avgQualityScore:  0,
    } as any);

    const res = await request(app)
      .get('/supervisor/dashboard')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('students');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/supervisor/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for student role', async () => {
    const res = await request(app)
      .get('/supervisor/dashboard')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'u1', role: 'student' }, SECRET, { expiresIn: '1h' })}`);
    expect(res.status).toBe(403);
  });

  it('allows admin role', async () => {
    mockService.getSupervisorDashboard.mockResolvedValue({ students: [] } as any);
    const res = await request(app)
      .get('/supervisor/dashboard')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'a1', role: 'admin' }, SECRET, { expiresIn: '1h' })}`);
    expect(res.status).toBe(200);
  });
});

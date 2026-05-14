jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
}));

jest.mock('../coordinator.service', () => ({
  getCoordinatorDashboard: jest.fn(),
  listStudents:            jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import coordinatorRouter from '../coordinator.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as service from '../coordinator.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET = 'test_secret_at_least_32_characters_long';

function token(role = 'coordinator', sub = 'coord-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/coordinator', coordinatorRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

describe('GET /coordinator/dashboard', () => {
  it('returns 200 with dashboard data', async () => {
    mockService.getCoordinatorDashboard.mockResolvedValue({
      activePlacements: 10,
      pendingApprovals: 2,
      complianceRate: 85,
      riskDistribution: { low: 6, medium: 3, high: 1 },
    } as any);

    const res = await request(app)
      .get('/coordinator/dashboard')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('activePlacements');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/coordinator/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for student role', async () => {
    const res = await request(app)
      .get('/coordinator/dashboard')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'u1', role: 'student' }, SECRET, { expiresIn: '1h' })}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /coordinator/students', () => {
  it('returns 200 with students list', async () => {
    mockService.listStudents.mockResolvedValue({ students: [], meta: {} } as any);
    const res = await request(app)
      .get('/coordinator/students')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });

  it('allows admin role', async () => {
    mockService.listStudents.mockResolvedValue({ students: [], meta: {} } as any);
    const res = await request(app)
      .get('/coordinator/students')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'a1', role: 'admin' }, SECRET, { expiresIn: '1h' })}`);
    expect(res.status).toBe(200);
  });
});

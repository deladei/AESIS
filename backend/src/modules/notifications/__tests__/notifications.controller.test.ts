jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
}));

jest.mock('../notifications.service', () => ({
  listNotifications: jest.fn(),
  getUnreadCount:    jest.fn(),
  markRead:          jest.fn(),
  markAllRead:       jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import notificationsRouter from '../notifications.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as service from '../notifications.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET = 'test_secret_at_least_32_characters_long';

function token(role = 'student', sub = 'user-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/notifications', notificationsRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

describe('GET /notifications', () => {
  it('returns 200 with notifications', async () => {
    mockService.listNotifications.mockResolvedValue({ notifications: [], meta: {} } as any);
    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(401);
  });
});

describe('GET /notifications/unread-count', () => {
  it('returns 200 with count', async () => {
    mockService.getUnreadCount.mockResolvedValue(3);
    const res = await request(app)
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('count', 3);
  });
});

describe('PATCH /notifications/:id/read', () => {
  it('returns 204 on success', async () => {
    mockService.markRead.mockResolvedValue(undefined as any);
    const id  = '00000000-0000-0000-0000-000000000001';
    const res = await request(app)
      .patch(`/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(204);
  });

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app)
      .patch('/notifications/not-a-uuid/read')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /notifications/read-all', () => {
  it('returns 200', async () => {
    mockService.markAllRead.mockResolvedValue({ count: 5 } as any);
    const res = await request(app)
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });
});

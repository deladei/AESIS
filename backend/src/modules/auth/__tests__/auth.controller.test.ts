// ── Env mock (must be first) ─────────────────────────────────
jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:                  'test',
    JWT_SECRET:                'test_secret_at_least_32_characters_long',
    REFRESH_TOKEN_EXPIRY_DAYS: 7,
    FRONTEND_URL:              'http://localhost:5173',
    EMAIL_FROM:                'test@aesis.edu',
    EMAIL_FROM_NAME:           'AESIS Test',
    BCRYPT_ROUNDS:             4,
  },
}));

jest.mock('../auth.service', () => ({
  register:              jest.fn(),
  login:                 jest.fn(),
  verifyEmail:           jest.fn(),
  refresh:               jest.fn(),
  logout:                jest.fn(),
  resetPasswordInit:     jest.fn(),
  resetPasswordConfirm:  jest.fn(),
}));

jest.mock('../../../config/prisma', () => ({
  prisma: {
    academicProgramme: { findMany: jest.fn() },
  },
}));

jest.mock('../../../shared/utils/token', () => ({
  REFRESH_COOKIE_NAME:    'aesis_refresh',
  refreshCookieOptions:   jest.fn(() => ({ httpOnly: true })),
  clearCookieOptions:     jest.fn(() => ({ httpOnly: true })),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from '../auth.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as authService from '../auth.service';
import { prisma } from '../../../config/prisma';

const mockService = authService as jest.Mocked<typeof authService>;
const mockPrisma  = prisma as jest.Mocked<typeof prisma>;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

describe('POST /auth/register', () => {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  const validBody = {
    email:                  'student@cs.edu',
    password:               'Password@123',
    firstName:              'Ama',
    lastName:               'Boateng',
    role:                   'student',
    programmeId:            '00000000-0000-0000-0000-000000000001',
    region:                 'greater_accra',
    companyName:            'Kofi Analytics Ltd',
    companyAddress:         '12 Independence Avenue, Accra',
    companySupervisorName:  'Yaw Mensah',
    companySupervisorEmail: 'yaw@kofianalytics.com',
    startDate:              tomorrow,
    endDate:                nextYear,
  };

  it('returns 201 on successful registration', async () => {
    mockService.register.mockResolvedValue({ id: 'user-1' } as any);

    const res = await request(app).post('/auth/register').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('userId', 'user-1');
  });

  it('returns 400 on Zod validation error (invalid email)', async () => {
    const res = await request(app).post('/auth/register').send({ ...validBody, email: 'notanemail' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  it('returns 200 with accessToken on success', async () => {
    mockService.login.mockResolvedValue({
      accessToken:  'acc.tok.en',
      refreshToken: 'ref.tok.en',
      user:         { id: 'u1', role: 'student' },
    } as any);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'student@cs.edu', password: 'Password@123' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('returns 400 on missing password', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'student@cs.edu' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/verify-email', () => {
  it('returns 200 on valid token', async () => {
    mockService.verifyEmail.mockResolvedValue({ message: 'Email verified' } as any);
    const res = await request(app).get('/auth/verify-email?token=abc123');
    expect(res.status).toBe(200);
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await request(app).get('/auth/verify-email');
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh', () => {
  it('returns 200 with new accessToken', async () => {
    mockService.refresh.mockResolvedValue({
      accessToken:  'new.acc.tok',
      refreshToken: 'new.ref.tok',
    } as any);

    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'aesis_refresh=oldtoken');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('returns 401 when no refresh cookie', async () => {
    const res = await request(app).post('/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('returns 204', async () => {
    mockService.logout.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', 'aesis_refresh=tok');
    expect(res.status).toBe(204);
  });
});

describe('POST /auth/reset-password', () => {
  it('returns 200 on valid email', async () => {
    mockService.resetPasswordInit.mockResolvedValue({ message: 'Email sent' } as any);
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'student@cs.edu' });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /auth/reset-password/confirm', () => {
  it('returns 200 on valid token+password', async () => {
    mockService.resetPasswordConfirm.mockResolvedValue({ message: 'Password updated' } as any);
    const res = await request(app)
      .patch('/auth/reset-password/confirm')
      .send({ token: 'reset-tok', password: 'NewPass@456' });
    expect(res.status).toBe(200);
  });
});

describe('GET /auth/programmes', () => {
  it('returns 200 with programmes list', async () => {
    (mockPrisma.academicProgramme.findMany as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Computer Science', code: 'CS' },
    ]);
    const res = await request(app).get('/auth/programmes');
    expect(res.status).toBe(200);
    expect(res.body.data.programmes).toHaveLength(1);
  });
});

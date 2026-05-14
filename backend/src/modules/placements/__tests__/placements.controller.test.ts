jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
}));

jest.mock('../placements.service', () => ({
  createPlacement:        jest.fn(),
  getMyPlacements:        jest.fn(),
  getPlacement:           jest.fn(),
  updatePlacementStatus:  jest.fn(),
  listPlacements:         jest.fn(),
  getSupervisorPlacements:jest.fn(),
  createCompany:          jest.fn(),
  listCompanies:          jest.fn(),
  getCompanyAnalytics:    jest.fn(),
  addPlacementDocument:   jest.fn(),
  getPlacementDocuments:  jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import placementsRouter from '../placements.router';
import companiesRouter from '../companies.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as service from '../placements.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET = 'test_secret_at_least_32_characters_long';
const PLACEMENT_ID = '00000000-0000-0000-0000-000000000001';

function token(role = 'student', sub = 'student-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/placements', placementsRouter);
  app.use('/companies',  companiesRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

// ── Student routes ──────────────────────────────────────────────

describe('POST /placements', () => {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  const validBody = {
    companyName:            'Acme Corp',
    companyAddress:         '123 Main Street, Lagos',
    companySupervisorName:  'John Doe',
    companySupervisorEmail: 'john@acme.com',
    startDate:              tomorrow,
    endDate:                nextYear,
  };

  it('returns 201 on success', async () => {
    mockService.createPlacement.mockResolvedValue({ id: PLACEMENT_ID } as any);

    const res = await request(app)
      .post('/placements')
      .set('Authorization', `Bearer ${token()}`)
      .send(validBody);

    expect(res.status).toBe(201);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/placements').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for coordinator role', async () => {
    const res = await request(app)
      .post('/placements')
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });
});

describe('GET /placements/mine', () => {
  it('returns 200 with student placements', async () => {
    mockService.getMyPlacements.mockResolvedValue([]);

    const res = await request(app)
      .get('/placements/mine')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });
});

// ── Coordinator routes ─────────────────────────────────────────

describe('GET /placements', () => {
  it('returns 200 for coordinator', async () => {
    mockService.listPlacements.mockResolvedValue({ placements: [], meta: {} } as any);

    const res = await request(app)
      .get('/placements')
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for student', async () => {
    const res = await request(app)
      .get('/placements')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /placements/:id/status', () => {
  it('returns 200 on success', async () => {
    mockService.updatePlacementStatus.mockResolvedValue({ id: PLACEMENT_ID } as any);

    const res = await request(app)
      .patch(`/placements/${PLACEMENT_ID}/status`)
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
  });
});

// ── Shared ─────────────────────────────────────────────────────

describe('GET /placements/:id', () => {
  it('returns 200 for student', async () => {
    mockService.getPlacement.mockResolvedValue({ id: PLACEMENT_ID } as any);

    const res = await request(app)
      .get(`/placements/${PLACEMENT_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app)
      .get('/placements/not-a-uuid')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });
});

// ── Supervisor ─────────────────────────────────────────────────

describe('GET /placements/assigned', () => {
  it('returns 200 for supervisor', async () => {
    mockService.getSupervisorPlacements.mockResolvedValue([]);

    const res = await request(app)
      .get('/placements/assigned')
      .set('Authorization', `Bearer ${token('academic_supervisor', 'sup-1')}`);

    expect(res.status).toBe(200);
  });
});

// ── Companies ──────────────────────────────────────────────────

describe('GET /companies', () => {
  it('returns 200 with companies for coordinator', async () => {
    mockService.listCompanies.mockResolvedValue({ companies: [], meta: {} } as any);

    const res = await request(app)
      .get('/companies')
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for student', async () => {
    const res = await request(app)
      .get('/companies')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /companies', () => {
  it('returns 201 on success', async () => {
    mockService.createCompany.mockResolvedValue({ id: 'co-1' } as any);

    const res = await request(app)
      .post('/companies')
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`)
      .send({ name: 'Acme Corp', industry: 'Technology', location: 'Lagos' });

    expect(res.status).toBe(201);
  });
});

describe('GET /companies/:id/analytics', () => {
  const COMPANY_ID = '00000000-0000-0000-0000-000000000009';

  it('returns 200 with analytics', async () => {
    mockService.getCompanyAnalytics.mockResolvedValue({ totalPlacements: 5 } as any);

    const res = await request(app)
      .get(`/companies/${COMPANY_ID}/analytics`)
      .set('Authorization', `Bearer ${token('coordinator', 'c1')}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for student', async () => {
    const res = await request(app)
      .get(`/companies/${COMPANY_ID}/analytics`)
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /placements/:id/documents', () => {
  it('returns 200 for student', async () => {
    mockService.getPlacementDocuments.mockResolvedValue([]);

    const res = await request(app)
      .get(`/placements/${PLACEMENT_ID}/documents`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });
});

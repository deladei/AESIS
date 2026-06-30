// Router-level (supertest) tests for the final-grade endpoints. The service is
// mocked — these assert the wiring: auth guard, param validation, body
// validation, and that each route reaches its service fn. Per-role
// authorization itself is unit-tested in grades.service.test.ts (the service is
// the single enforcement point).
jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV: 'test',
  },
}));

jest.mock('../grades.service', () => ({
  getGrade: jest.fn(),
  scoreComponent: jest.fn(),
  aggregateGrade: jest.fn(),
  overrideGrade: jest.fn(),
  releaseGrade: jest.fn(),
  inviteIndustryScore: jest.fn(),
  getIndustryInviteContext: jest.fn(),
  submitIndustryScore: jest.fn(),
  getGradeAudit: jest.fn(),
  releaseCohort: jest.fn(),
  getCohortReport: jest.fn(),
  getCohortGradeStats: jest.fn(),
  getCohortRegionRollups: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import gradesRouter from '../grades.router';
import gradesPublicRouter from '../grades.public.router';
import { globalErrorHandler, AppError } from '../../../middleware/errorHandler';
import * as service from '../grades.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET = 'test_secret_at_least_32_characters_long';
const PID = '11111111-1111-1111-1111-111111111111';
const AYID = '22222222-2222-2222-2222-222222222222';

function token(role = 'coordinator', sub = 'coord-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/grades', gradesRouter);
  app.use('/grade-invite', gradesPublicRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();
const auth = (t = token()) => ['Authorization', `Bearer ${t}`] as const;

afterEach(() => jest.clearAllMocks());

describe('auth guard', () => {
  it('401s every authenticated route without a token', async () => {
    expect((await request(app).get(`/grades/${PID}`)).status).toBe(401);
    expect((await request(app).get(`/grades/${PID}/audit`)).status).toBe(401);
    expect((await request(app).post(`/grades/${PID}/aggregate`)).status).toBe(401);
    expect((await request(app).post(`/grades/cohort/${AYID}/release`)).status).toBe(401);
    expect((await request(app).get(`/grades/cohort/${AYID}/report`)).status).toBe(401);
    expect((await request(app).get(`/grades/cohort/${AYID}/stats`)).status).toBe(401);
    expect((await request(app).get(`/grades/cohort/${AYID}/regions`)).status).toBe(401);
  });
});

describe('GET /grades/:id', () => {
  it('200s and returns the serialized grade', async () => {
    mockService.getGrade.mockResolvedValue({ status: 'draft', released: false } as any);
    const res = await request(app).get(`/grades/${PID}`).set(...auth());
    expect(res.status).toBe(200);
    expect(mockService.getGrade).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      PID,
    );
  });

  it('400s on a non-uuid id', async () => {
    const res = await request(app).get('/grades/not-a-uuid').set(...auth());
    expect(res.status).toBe(400);
    expect(mockService.getGrade).not.toHaveBeenCalled();
  });
});

describe('POST /grades/:id/component', () => {
  it('200s with a valid body', async () => {
    mockService.scoreComponent.mockResolvedValue({} as any);
    const res = await request(app)
      .post(`/grades/${PID}/component`)
      .set(...auth())
      .send({ component: 'university', raw: 70 });
    expect(res.status).toBe(200);
    expect(mockService.scoreComponent).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      PID,
      { component: 'university', raw: 70 },
    );
  });

  it('400s on an out-of-range raw score', async () => {
    const res = await request(app)
      .post(`/grades/${PID}/component`)
      .set(...auth())
      .send({ component: 'university', raw: 150 });
    expect(res.status).toBe(400);
    expect(mockService.scoreComponent).not.toHaveBeenCalled();
  });

  it('400s on an unknown component', async () => {
    const res = await request(app)
      .post(`/grades/${PID}/component`)
      .set(...auth())
      .send({ component: 'attendance', raw: 50 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /grades/:id/override', () => {
  it('200s with total + reason', async () => {
    mockService.overrideGrade.mockResolvedValue({} as any);
    const res = await request(app)
      .patch(`/grades/${PID}/override`)
      .set(...auth())
      .send({ total: 85, reason: 'moderation' });
    expect(res.status).toBe(200);
    expect(mockService.overrideGrade).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      PID,
      { total: 85, reason: 'moderation' },
    );
  });

  it('400s when the reason is missing', async () => {
    const res = await request(app)
      .patch(`/grades/${PID}/override`)
      .set(...auth())
      .send({ total: 85 });
    expect(res.status).toBe(400);
  });
});

describe('GET /grades/:id/audit', () => {
  it('200s and returns the trail', async () => {
    mockService.getGradeAudit.mockResolvedValue([{ id: 'a-1', action: 'grade_released' }] as any);
    const res = await request(app).get(`/grades/${PID}/audit`).set(...auth());
    expect(res.status).toBe(200);
    expect(mockService.getGradeAudit).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      PID,
    );
  });

  it('surfaces the service 403 for a supervisor', async () => {
    mockService.getGradeAudit.mockRejectedValue(new AppError(403, 'Access denied'));
    const res = await request(app)
      .get(`/grades/${PID}/audit`)
      .set(...auth(token('academic_supervisor', 'sup-1')));
    expect(res.status).toBe(403);
  });
});

describe('POST /grades/cohort/:academicYearId/release', () => {
  it('200s and returns the released count', async () => {
    mockService.releaseCohort.mockResolvedValue({ academicYearId: AYID, released: 3 } as any);
    const res = await request(app).post(`/grades/cohort/${AYID}/release`).set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data.released).toBe(3);
    expect(mockService.releaseCohort).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      AYID,
    );
  });

  it('400s on a non-uuid year and is not shadowed by /:id', async () => {
    const res = await request(app).post('/grades/cohort/not-a-uuid/release').set(...auth());
    expect(res.status).toBe(400);
    expect(mockService.releaseCohort).not.toHaveBeenCalled();
  });
});

describe('GET /grades/cohort/:academicYearId/report', () => {
  it('200s and returns the report payload', async () => {
    mockService.getCohortReport.mockResolvedValue({ academicYearId: AYID, academicYear: '2025/2026', count: 1, rows: [] } as any);
    const res = await request(app).get(`/grades/cohort/${AYID}/report`).set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data.academicYear).toBe('2025/2026');
    expect(mockService.getCohortReport).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      AYID,
    );
  });

  it('400s on a non-uuid year', async () => {
    const res = await request(app).get('/grades/cohort/not-a-uuid/report').set(...auth());
    expect(res.status).toBe(400);
    expect(mockService.getCohortReport).not.toHaveBeenCalled();
  });
});

describe('GET /grades/cohort/:academicYearId/stats', () => {
  it('200s and returns the stats payload', async () => {
    mockService.getCohortGradeStats.mockResolvedValue({ academicYearId: AYID, count: 5, mean: 59.4 } as any);
    const res = await request(app).get(`/grades/cohort/${AYID}/stats`).set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data.mean).toBe(59.4);
    expect(mockService.getCohortGradeStats).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      AYID,
    );
  });

  it('400s on a non-uuid year', async () => {
    const res = await request(app).get('/grades/cohort/not-a-uuid/stats').set(...auth());
    expect(res.status).toBe(400);
    expect(mockService.getCohortGradeStats).not.toHaveBeenCalled();
  });
});

describe('GET /grades/cohort/:academicYearId/regions', () => {
  it('200s and returns the rollup payload', async () => {
    mockService.getCohortRegionRollups.mockResolvedValue({ academicYearId: AYID, count: 4, regions: [] } as any);
    const res = await request(app).get(`/grades/cohort/${AYID}/regions`).set(...auth());
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(4);
    expect(mockService.getCohortRegionRollups).toHaveBeenCalledWith(
      { id: 'coord-1', role: 'coordinator' },
      AYID,
    );
  });

  it('400s on a non-uuid year', async () => {
    const res = await request(app).get('/grades/cohort/not-a-uuid/regions').set(...auth());
    expect(res.status).toBe(400);
    expect(mockService.getCohortRegionRollups).not.toHaveBeenCalled();
  });
});

describe('public /grade-invite/:token', () => {
  it('GET 200s with the form context (no auth)', async () => {
    mockService.getIndustryInviteContext.mockResolvedValue({ organisation: 'Kofi Tech Ltd' } as any);
    const res = await request(app).get('/grade-invite/sometoken');
    expect(res.status).toBe(200);
    expect(mockService.getIndustryInviteContext).toHaveBeenCalledWith('sometoken');
  });

  it('POST 200s with a valid raw score (no auth)', async () => {
    mockService.submitIndustryScore.mockResolvedValue({ submitted: true } as any);
    const res = await request(app).post('/grade-invite/sometoken').send({ raw: 72 });
    expect(res.status).toBe(200);
    expect(mockService.submitIndustryScore).toHaveBeenCalledWith('sometoken', { raw: 72 });
  });

  it('POST 400s on an out-of-range raw score', async () => {
    const res = await request(app).post('/grade-invite/sometoken').send({ raw: -5 });
    expect(res.status).toBe(400);
    expect(mockService.submitIndustryScore).not.toHaveBeenCalled();
  });
});

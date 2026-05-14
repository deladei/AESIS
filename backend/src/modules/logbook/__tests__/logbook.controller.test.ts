jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
}));

jest.mock('../logbook.service', () => ({
  getOrCreateDraft: jest.fn(),
  saveDraft:        jest.fn(),
  submitLogbook:    jest.fn(),
  getSubmission:    jest.fn(),
  listSubmissions:  jest.fn(),
  addAttachment:    jest.fn(),
  listAttachments:  jest.fn(),
  submitFeedback:   jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import logbookRouter from '../logbook.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';
import * as service from '../logbook.service';

const mockService = service as jest.Mocked<typeof service>;
const SECRET      = 'test_secret_at_least_32_characters_long';

const PLACEMENT_ID  = '00000000-0000-0000-0000-000000000001';
const SUBMISSION_ID = '00000000-0000-0000-0000-000000000002';

function token(role = 'student', sub = 'student-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/logbook', logbookRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

afterEach(() => jest.clearAllMocks());

// ── Draft ──────────────────────────────────────────────────────

describe('GET /logbook/placements/:placementId/draft', () => {
  it('returns 200 with submission', async () => {
    mockService.getOrCreateDraft.mockResolvedValue({ id: SUBMISSION_ID, weekNumber: 1 } as any);

    const res = await request(app)
      .get(`/logbook/placements/${PLACEMENT_ID}/draft?weekNumber=1`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('id');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/logbook/placements/${PLACEMENT_ID}/draft?weekNumber=1`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for supervisor role', async () => {
    const res = await request(app)
      .get(`/logbook/placements/${PLACEMENT_ID}/draft?weekNumber=1`)
      .set('Authorization', `Bearer ${token('academic_supervisor', 'sup-1')}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /logbook/submissions/:submissionId/draft', () => {
  const validBody = {
    tasksCompleted:   'Built REST API endpoints',
    technologiesUsed: 'Node.js, Express',
    hoursWorked:      40,
  };

  it('returns 200 on successful draft save', async () => {
    mockService.saveDraft.mockResolvedValue({ id: SUBMISSION_ID } as any);

    const res = await request(app)
      .patch(`/logbook/submissions/${SUBMISSION_ID}/draft`)
      .set('Authorization', `Bearer ${token()}`)
      .send(validBody);

    expect(res.status).toBe(200);
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .patch(`/logbook/submissions/${SUBMISSION_ID}/draft`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ hoursWorked: 40 });

    expect(res.status).toBe(400);
  });
});

describe('POST /logbook/submissions/:submissionId/submit', () => {
  it('returns 200 on success', async () => {
    mockService.submitLogbook.mockResolvedValue({ id: SUBMISSION_ID } as any);

    const res = await request(app)
      .post(`/logbook/submissions/${SUBMISSION_ID}/submit`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });
});

// ── Shared reads ───────────────────────────────────────────────

describe('GET /logbook/placements/:placementId/submissions', () => {
  it('returns 200 for student', async () => {
    mockService.listSubmissions.mockResolvedValue({ submissions: [], meta: {} } as any);

    const res = await request(app)
      .get(`/logbook/placements/${PLACEMENT_ID}/submissions`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });

  it('returns 200 for supervisor', async () => {
    mockService.listSubmissions.mockResolvedValue({ submissions: [], meta: {} } as any);

    const res = await request(app)
      .get(`/logbook/placements/${PLACEMENT_ID}/submissions`)
      .set('Authorization', `Bearer ${token('academic_supervisor', 'sup-1')}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /logbook/submissions/:submissionId', () => {
  it('returns 200 with submission', async () => {
    mockService.getSubmission.mockResolvedValue({ id: SUBMISSION_ID } as any);

    const res = await request(app)
      .get(`/logbook/submissions/${SUBMISSION_ID}`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 for non-UUID id', async () => {
    const res = await request(app)
      .get('/logbook/submissions/not-a-uuid')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /logbook/submissions/:submissionId/attachments', () => {
  it('returns 200 with attachments list', async () => {
    mockService.listAttachments.mockResolvedValue([{ id: 'att-1', fileName: 'doc.pdf' }] as any);

    const res = await request(app)
      .get(`/logbook/submissions/${SUBMISSION_ID}/attachments`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /logbook/submissions/:submissionId/attachments', () => {
  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post(`/logbook/submissions/${SUBMISSION_ID}/attachments`)
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(400);
  });

  it('returns 201 when a valid file is uploaded', async () => {
    mockService.addAttachment.mockResolvedValue({ id: 'att-2' } as any);

    const res = await request(app)
      .post(`/logbook/submissions/${SUBMISSION_ID}/attachments`)
      .set('Authorization', `Bearer ${token()}`)
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
  });
});

// ── Supervisor feedback ────────────────────────────────────────

describe('POST /logbook/submissions/:submissionId/feedback', () => {
  it('returns 201 on success', async () => {
    mockService.submitFeedback.mockResolvedValue({ id: 'fb-1' } as any);

    const res = await request(app)
      .post(`/logbook/submissions/${SUBMISSION_ID}/feedback`)
      .set('Authorization', `Bearer ${token('academic_supervisor', 'sup-1')}`)
      .send({ feedbackText: 'Good work — well done on this submission!', outcome: 'approved' });

    expect(res.status).toBe(201);
  });

  it('returns 403 for student role', async () => {
    const res = await request(app)
      .post(`/logbook/submissions/${SUBMISSION_ID}/feedback`)
      .set('Authorization', `Bearer ${token()}`)
      .send({ feedbackText: 'Good work — well done on this submission!', outcome: 'approved' });

    expect(res.status).toBe(403);
  });
});

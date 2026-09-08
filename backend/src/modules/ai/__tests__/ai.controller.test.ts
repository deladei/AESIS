jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
    // Port 1 refuses instantly, so unmocked fetches fail fast into the KB fallback.
    AI_ENGINE_URL: 'http://127.0.0.1:1',
    AI_ENGINE_API_KEY: 'test-key',
  },
}));

// aiRouter mounts the real aiRateLimiter, whose Redis-backed store opens an
// ioredis client (offline queue + infinite retryStrategy) on the first request.
// Against an unreachable Redis that client reconnects forever, leaving an open
// handle that prevents Jest from exiting (hangs the whole --runInBand run).
// The limiter isn't under test here — stub it to a pass-through so no real
// Redis connection is ever opened.
jest.mock('../../../middleware/rateLimiter', () => ({
  aiRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// The student record is real data about a real person. What is under test is
// WHO it is built for, so the builder is stubbed and its calls recorded rather
// than hitting the dashboard query.
const buildStudentContext = jest.fn(async (id: string) => `Current week: 3 of 6 (${id})`);
jest.mock('../chat.context', () => ({
  buildStudentContext: (id: string) => buildStudentContext(id),
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import aiRouter from '../ai.router';
import { globalErrorHandler } from '../../../middleware/errorHandler';

const SECRET = 'test_secret_at_least_32_characters_long';

function token(role = 'student', sub = 'student-1') {
  return jwt.sign({ sub, role }, SECRET, { expiresIn: '1h' });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiRouter);
  app.use(globalErrorHandler);
  return app;
}

const app = buildApp();

describe('POST /ai/chat', () => {
  it('returns SSE stream for a matched keyword query', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'What are the minimum hours per week?' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('data:');
    expect(res.text).toContain('[DONE]');
  }, 15000); // SSE streams word-by-word — allow extra time

  it('returns SSE stream for an unmatched query (fallback answer)', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'Tell me something completely unrelated to internships xyz123' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('[DONE]');
  }, 15000);

  it('returns 400 for empty message', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when message field is missing', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .send({ message: 'hello' });

    expect(res.status).toBe(401);
  });

  it('says it is unavailable rather than answering from a stale local copy', async () => {
    // The fallback used to be a keyword lookup table that asserted a Friday
    // 23:59 deadline, a 40-hour weekly minimum and a "week 12" mid-term report
    // — none of which this system enforces, and the last of which is longer
    // than the whole programme. Regulations now live in one place and are
    // retrieved by the engine; when the engine is down the honest answer is
    // that we cannot answer.
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'When is the logbook submission deadline?' });

    expect(res.text).toContain('temporarily unavailable');
    expect(res.text).toContain('academic supervisor');
    expect(res.text).not.toContain('Friday');
  }, 15000);

  it('never invents a rule for a question it cannot reach the engine for', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'What does high risk tier mean for a student?' });

    expect(res.text).toContain('temporarily unavailable');
    // No percentages, thresholds or tier rules invented locally.
    expect(res.text).not.toMatch(/\d+\s*%|0\.\d+/);
  }, 15000);
});

describe('POST /ai/chat — whose record is attached', () => {
  beforeEach(() => buildStudentContext.mockClear());

  it("builds the record from the authenticated id, never the request body", async () => {
    await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token('student', 'student-real')}`)
      // A caller naming someone else must not be able to reach their record.
      .send({ message: 'how am I doing?', student_id: 'student-victim', context: 'injected' });

    expect(buildStudentContext).toHaveBeenCalledTimes(1);
    expect(buildStudentContext).toHaveBeenCalledWith('student-real');
  });

  it.each(['academic_supervisor', 'company_supervisor', 'coordinator', 'admin'])(
    'attaches no student record for %s',
    async (role) => {
      await request(app)
        .post('/ai/chat')
        .set('Authorization', `Bearer ${token(role, 'staff-1')}`)
        .send({ message: 'what are the submission rules?' });

      // A supervisor asking the assistant a question is not asking about a
      // logbook of their own; building one from their user id would attach
      // either nothing or, worse, someone else's figures.
      expect(buildStudentContext).not.toHaveBeenCalled();
    },
  );
});

describe('GET /ai/health', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports engine up when the AI engine /health responds ok', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

    const res = await request(app)
      .get('/ai/health')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // `knowledge` is null here because this test stubs only /health; the
    // corpus lookup is a second call. What matters is that a failed corpus
    // count never reads as an engine that is down.
    expect(res.body).toEqual({ engine: true, knowledge: null });
  });

  it('reports engine down when the AI engine is unreachable', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app)
      .get('/ai/health')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ engine: false, knowledge: null });
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/ai/health');
    expect(res.status).toBe(401);
  });
});

/**
 * The engine runs on a plan that suspends it after a quiet spell, and waking it
 * takes longer than the request will wait. The attempt that fails is also the
 * attempt that wakes it, so the assistant retries once rather than telling a
 * student it is unavailable when it is merely asleep.
 */
describe('POST /ai/chat — a sleeping engine', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  /** An SSE-ish upstream body, enough for the handler to stream. */
  const streamingBody = (text: string) => ({
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => sent
            ? { done: true, value: undefined }
            : ((sent = true), { done: false, value: new TextEncoder().encode(text) }),
        };
      },
    },
  });

  it('retries once and answers when the first attempt times out', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      // First call fails the way an abort does; second succeeds, as it would
      // once the first had woken the service.
      if (calls === 1) throw new Error('The operation was aborted due to timeout');
      return streamingBody('Hello from the engine');
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(200);
    expect(calls).toBe(2);
    expect(res.text).toContain('Hello from the engine');
    // The student must NOT be told it is unavailable when it answered.
    expect(res.text).not.toContain('temporarily unavailable');
  }, 15000);

  it('falls back honestly when the retry also fails', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'hello' });

    // Still a well-formed stream — a dead engine is not a broken endpoint.
    expect(res.status).toBe(200);
    expect(res.text).toContain('[DONE]');
  }, 15000);

  it('does not retry a request the engine actually answered', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return streamingBody('answered first time');
    }) as unknown as typeof fetch;

    await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'hello' });

    expect(calls).toBe(1);
  }, 15000);
});

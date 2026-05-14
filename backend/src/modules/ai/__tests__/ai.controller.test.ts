jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test_secret_at_least_32_characters_long',
    NODE_ENV:   'test',
  },
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

  it('matches logbook deadline keywords', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'When is the logbook submission deadline?' });

    expect(res.text).toContain('Friday');
  }, 15000);

  it('matches risk tier keywords', async () => {
    const res = await request(app)
      .post('/ai/chat')
      .set('Authorization', `Bearer ${token()}`)
      .send({ message: 'What does high risk tier mean for a student?' });

    expect(res.text).toContain('XGBoost');
  }, 15000);
});

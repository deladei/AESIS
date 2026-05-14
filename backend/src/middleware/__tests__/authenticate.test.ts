import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

jest.mock('../../config/env', () => ({
  env: { JWT_SECRET: 'test_secret_at_least_32_characters_long' },
}));

import { authenticate } from '../authenticate';

const SECRET = 'test_secret_at_least_32_characters_long';

function makeReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader } } as unknown as Request;
}

function makeNext(): NextFunction {
  return jest.fn() as NextFunction;
}

const fakeRes = {} as Response;

describe('authenticate middleware', () => {
  it('throws 401 when Authorization header is missing', () => {
    const req = makeReq(undefined);
    expect(() => authenticate(req, fakeRes, makeNext())).toThrow('Missing or malformed Authorization header');
  });

  it('throws 401 when header does not start with Bearer', () => {
    const req = makeReq('Basic sometoken');
    expect(() => authenticate(req, fakeRes, makeNext())).toThrow('Missing or malformed Authorization header');
  });

  it('throws 401 for an invalid JWT', () => {
    const req = makeReq('Bearer not.a.real.token');
    expect(() => authenticate(req, fakeRes, makeNext())).toThrow('Invalid or expired access token');
  });

  it('throws 401 for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'uid', role: 'student' }, 'wrong-secret', { expiresIn: '1h' });
    const req = makeReq(`Bearer ${token}`);
    expect(() => authenticate(req, fakeRes, makeNext())).toThrow('Invalid or expired access token');
  });

  it('throws 401 for an expired token', () => {
    const token = jwt.sign({ sub: 'uid', role: 'student' }, SECRET, { expiresIn: '-1s' });
    const req = makeReq(`Bearer ${token}`);
    expect(() => authenticate(req, fakeRes, makeNext())).toThrow('Invalid or expired access token');
  });

  it('attaches payload to req.user and calls next for a valid token', () => {
    const token = jwt.sign({ sub: 'uid-1', role: 'student' }, SECRET, { expiresIn: '1h' });
    const req  = makeReq(`Bearer ${token}`);
    const next = makeNext();

    authenticate(req, fakeRes, next);

    expect(req.user).toMatchObject({ sub: 'uid-1', role: 'student' });
    expect(next).toHaveBeenCalled();
  });
});

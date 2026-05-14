jest.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET:  'test_secret_at_least_32_characters_long',
    JWT_EXPIRY:  '15m',
    NODE_ENV:    'test',
  },
}));

import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  generateSecureToken,
  refreshCookieOptions,
  clearCookieOptions,
} from '../token';

const SECRET = 'test_secret_at_least_32_characters_long';

describe('signAccessToken', () => {
  it('returns a JWT that verifies with the same secret', () => {
    const token   = signAccessToken({ sub: 'uid-1', role: 'student' });
    const payload = jwt.verify(token, SECRET) as Record<string, unknown>;
    expect(payload['sub']).toBe('uid-1');
    expect(payload['role']).toBe('student');
  });
});

describe('verifyAccessToken', () => {
  it('returns the payload for a valid token', () => {
    const token   = jwt.sign({ sub: 'uid-2', role: 'coordinator' }, SECRET, { expiresIn: '1h' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('uid-2');
    expect(payload.role).toBe('coordinator');
  });

  it('throws for an invalid token', () => {
    expect(() => verifyAccessToken('bad.token.here')).toThrow();
  });
});

describe('generateRefreshToken', () => {
  it('returns a raw UUID and its SHA-256 hash', () => {
    const { raw, hash } = generateRefreshToken();
    expect(raw).toMatch(/^[0-9a-f-]{36}$/);
    expect(hash).toHaveLength(64);
  });

  it('generates different tokens on each call', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('hashRefreshToken', () => {
  it('produces the same hash as generateRefreshToken', () => {
    const { raw, hash } = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hash);
  });
});

describe('generateSecureToken', () => {
  it('returns a 64-char hex string', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });
});

describe('refreshCookieOptions', () => {
  it('returns httpOnly cookie options with correct maxAge', () => {
    const opts = refreshCookieOptions(7);
    expect(opts.httpOnly).toBe(true);
    expect(opts.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    expect(opts.path).toBe('/api/v1/auth/refresh');
  });
});

describe('clearCookieOptions', () => {
  it('returns options with maxAge 0', () => {
    const opts = clearCookieOptions();
    expect(opts.maxAge).toBe(0);
    expect(opts.httpOnly).toBe(true);
  });
});

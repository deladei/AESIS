import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { JwtPayload } from '../../middleware/authenticate';

export function signAccessToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

// Returns { raw, hash } — store hash in DB, send raw to client
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw  = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// For email verification and password reset (single-use, short-lived)
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const REFRESH_COOKIE_NAME = 'aesis_refresh';

export function refreshCookieOptions(expiryDays: number) {
  return {
    httpOnly:  true,
    secure:    env.NODE_ENV === 'production',
    sameSite:  'strict' as const,
    path:      '/api/v1/auth/refresh',
    maxAge:    expiryDays * 24 * 60 * 60 * 1000, // ms
  };
}

export function clearCookieOptions() {
  return {
    httpOnly:  true,
    secure:    env.NODE_ENV === 'production',
    sameSite:  'strict' as const,
    path:      '/api/v1/auth/refresh',
    maxAge:    0,
  };
}

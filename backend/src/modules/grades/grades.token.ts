import crypto from 'crypto';

/**
 * Magic-link tokens for the company supervisor's industry score. Same shape and
 * guarantees as attestation tokens (no account, no login): the raw token is
 * handed out ONCE and only its SHA-256 hash is persisted, so a DB read can never
 * reveal a usable link. The token itself is the authorization for the public
 * submit route.
 */
export function generateIndustryToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashIndustryToken(token) };
}

export function hashIndustryToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

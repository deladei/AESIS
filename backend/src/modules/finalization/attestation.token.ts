import crypto from 'crypto';

/**
 * Magic-link tokens for company-supervisor attestation. No account, no login.
 * We hand out the raw token ONCE (in the invite response / email) and persist
 * only its SHA-256 hash, so a DB read can never reveal a usable link.
 */
export function generateAttestationToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashAttestationToken(token) };
}

export function hashAttestationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

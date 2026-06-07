import crypto from 'crypto';
import { generateAttestationToken, hashAttestationToken } from '../attestation.token';

// Pure unit tests — no DB. Prove the magic-link token contract: the raw token is
// high-entropy, only its hash is meant to be stored, and hashing is stable.
describe('attestation token', () => {
  it('generates a 64-char hex token with a matching sha256 hash', () => {
    const { token, tokenHash } = generateAttestationToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    // The stored hash must never equal the usable token.
    expect(tokenHash).not.toBe(token);
  });

  it('hashing is deterministic and collision-distinct per token', () => {
    const a = generateAttestationToken();
    const b = generateAttestationToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(hashAttestationToken(a.token)).toBe(a.tokenHash);
  });
});

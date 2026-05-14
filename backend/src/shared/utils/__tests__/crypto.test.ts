jest.mock('../../../config/env', () => ({
  env: {
    ENCRYPTION_KEY: 'a'.repeat(64), // 32 bytes in hex = 64 hex chars
  },
}));

import { encryptPII, decryptPII } from '../crypto';

describe('encryptPII / decryptPII', () => {
  it('round-trips a plain text string', () => {
    const original = 'user@example.com';
    const encrypted = encryptPII(original);
    expect(encrypted).not.toBe(original);
    expect(decryptPII(encrypted)).toBe(original);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const text = 'sensitive data';
    const first  = encryptPII(text);
    const second = encryptPII(text);
    expect(first).not.toBe(second);
    expect(decryptPII(first)).toBe(text);
    expect(decryptPII(second)).toBe(text);
  });

  it('stores a JSON payload with iv, authTag, ciphertext', () => {
    const stored = encryptPII('test');
    const parsed = JSON.parse(stored);
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('authTag');
    expect(parsed).toHaveProperty('ciphertext');
  });

  it('encrypts empty string', () => {
    const encrypted = encryptPII('');
    expect(decryptPII(encrypted)).toBe('');
  });

  it('handles unicode characters', () => {
    const text = 'Ade Oluwafẹmi — 123 Main Àdé Street';
    expect(decryptPII(encryptPII(text))).toBe(text);
  });
});

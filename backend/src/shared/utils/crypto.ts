import crypto from 'crypto';
import { env } from '../../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface Encrypted {
  iv: string;
  authTag: string;
  ciphertext: string;
}

// Returns JSON string suitable for storing in a VARCHAR column
export function encryptPII(plaintext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY.slice(0, 64), 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  const payload: Encrypted = {
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };

  return JSON.stringify(payload);
}

export function decryptPII(stored: string): string {
  const { iv, authTag, ciphertext } = JSON.parse(stored) as Encrypted;
  const key = Buffer.from(env.ENCRYPTION_KEY.slice(0, 64), 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'), {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  return decipher.update(Buffer.from(ciphertext, 'hex')).toString('utf8') + decipher.final('utf8');
}

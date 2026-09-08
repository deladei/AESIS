import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
jest.mock('../../../config/prisma', () => ({
  prisma: {
    user:          { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    studentRoster: { findFirst: jest.fn(), update: jest.fn() },
    department:    { findFirst: jest.fn() },
  },
}));
jest.mock('../../../config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    BCRYPT_ROUNDS: 4,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_REDIRECT_URI: 'https://api.example.com/api/v1/auth/google/callback',
  },
}));

import { prisma } from '../../../config/prisma';
import { isGoogleConfigured, buildAuthUrl, resolveIdentity } from '../google.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const verified = {
  email: 'ama.mensah@st.ug.edu.gh',
  emailVerified: true,
  firstName: 'Ama',
  lastName: 'Mensah',
};

/**
 * Google proves an email address; it does not grant membership. AESIS is a
 * supervised programme with roles, placements and supervisor assignments, so
 * these tests are about who is allowed through the door — not about OAuth.
 */
describe('google sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mp.department.findFirst as jest.Mock).mockResolvedValue({ id: 'dept-cs', code: 'CS' });
  });

  it('is configured only when all three settings are present', () => {
    expect(isGoogleConfigured()).toBe(true);
  });

  it('issues a fresh unguessable state per attempt', () => {
    // Reused or predictable state is the whole attack: a crafted callback URL
    // logs a victim into an attacker's Google account.
    const a = buildAuthUrl();
    const b = buildAuthUrl();
    expect(a.state).not.toEqual(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(32);
    expect(a.url).toContain(`state=${a.state}`);
    expect(a.url).toContain('accounts.google.com');
  });

  it('signs in an existing account whatever its role', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-1', role: 'coordinator', isVerified: true,
    });

    await expect(resolveIdentity(verified)).resolves.toEqual({
      kind: 'signed-in', userId: 'u-1', role: 'coordinator',
    });
    expect(mp.user.create).not.toHaveBeenCalled();
  });

  it('refuses an unverified Google address', async () => {
    // Google asserts unverified addresses too; matching one against the roster
    // would let someone claim another student's place.
    await expect(resolveIdentity({ ...verified, emailVerified: false }))
      .rejects.toMatchObject({ statusCode: 401 });
    expect(mp.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates nothing for someone who is not on the roster', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.studentRoster.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(resolveIdentity(verified)).resolves.toEqual({ kind: 'not-on-roster' });
    expect(mp.user.create).not.toHaveBeenCalled();
  });

  it('creates a student when the roster has them, and claims the row', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.studentRoster.findFirst as jest.Mock).mockResolvedValue({
      id: 'r-1', firstName: 'Ama', lastName: 'Mensah', indexNumber: 'UEB0099',
    });
    (mp.user.create as jest.Mock).mockResolvedValue({ id: 'u-new', role: 'student' });

    const out = await resolveIdentity(verified);

    expect(out).toEqual({ kind: 'signed-in', userId: 'u-new', role: 'student' });
    expect(mp.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'student', indexNumber: 'UEB0099', isVerified: true, departmentId: 'dept-cs',
      }),
    }));
    // The roster row is claimed, so a second Google account cannot take it.
    expect(mp.studentRoster.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r-1' },
    }));
  });

  it('never leaves a usable password on a Google-created account', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.studentRoster.findFirst as jest.Mock).mockResolvedValue({
      id: 'r-1', firstName: 'Ama', lastName: 'Mensah', indexNumber: null,
    });
    (mp.user.create as jest.Mock).mockResolvedValue({ id: 'u-new', role: 'student' });

    await resolveIdentity(verified);

    const { passwordHash } = (mp.user.create as jest.Mock).mock.calls[0][0].data;
    // A real bcrypt digest of something nobody knows — not an empty string,
    // whose comparison behaviour is a library detail this must not rely on.
    expect(passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('only offers roster rows nobody has claimed', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.studentRoster.findFirst as jest.Mock).mockResolvedValue(null);

    await resolveIdentity(verified);

    expect(mp.studentRoster.findFirst).toHaveBeenCalledWith({
      where: { email: verified.email, claimedById: null },
    });
  });

  it('settles a pending email verification, since Google proved the address', async () => {
    (mp.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'u-2', role: 'student', isVerified: false,
    });

    await resolveIdentity(verified);

    expect(mp.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u-2' },
      data: { isVerified: true, verificationToken: null },
    }));
  });
});

/**
 * The ID token is the only thing standing between "someone typed a JWT" and
 * "Google says this is their address". These tests are about that signature
 * check, so each one builds a real token with a real key and then breaks
 * exactly one thing about it.
 */
describe('google ID token verification', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  // Google's own signing keys are never in play here; a key we control lets us
  // assert that a *valid* signature is accepted, which a fixture cannot.
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };

  const sign = (claims: Record<string, unknown>) =>
    jwt.sign(claims, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
      algorithm: 'RS256',
      keyid:     'test-kid',
    });

  const goodClaims = () => ({
    iss: 'https://accounts.google.com',
    aud: 'client-id',
    sub: '1234567890',
    email: 'ama.mensah@st.ug.edu.gh',
    email_verified: true,
    given_name: 'Ama',
    family_name: 'Mensah',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  /** Google's two endpoints: the code exchange, then the key set. */
  const mockGoogle = (idToken: string | undefined, tokenOk = true) => {
    (global.fetch as jest.Mock) = jest.fn(async (url: string) => {
      if (String(url).includes('/token')) {
        return tokenOk
          ? { ok: true,  json: async () => ({ id_token: idToken }) }
          : { ok: false, status: 400, text: async () => 'redirect_uri_mismatch' };
      }
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  /** Re-imported per test: the module caches Google's key set. */
  const freshExchange = async () => (await import('../google.service')).exchangeCode;

  it('accepts a correctly signed token and returns the identity it proves', async () => {
    mockGoogle(sign(goodClaims()));
    await expect((await freshExchange())('code')).resolves.toEqual({
      email: 'ama.mensah@st.ug.edu.gh',
      emailVerified: true,
      firstName: 'Ama',
      lastName: 'Mensah',
    });
  });

  it('rejects a token signed by anyone else', async () => {
    // The whole point of the signature check: an attacker can compose these
    // claims freely, but cannot produce Google's signature over them.
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = jwt.sign(goodClaims(), other.privateKey.export({ type: 'pkcs8', format: 'pem' }), {
      algorithm: 'RS256', keyid: 'test-kid',
    });
    mockGoogle(forged);
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token minted for a different OAuth client', async () => {
    // Without the audience check, an ID token from any other Google app —
    // which its operator can read — would sign that person in here.
    mockGoogle(sign({ ...goodClaims(), aud: 'someone-elses-client' }));
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token from the wrong issuer', async () => {
    mockGoogle(sign({ ...goodClaims(), iss: 'https://evil.example.com' }));
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an expired token', async () => {
    mockGoogle(sign({ ...goodClaims(), exp: Math.floor(Date.now() / 1000) - 60 }));
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an unsigned token, whatever it claims', async () => {
    // `alg: none` is the classic JWT forgery; algorithms is pinned to RS256.
    const header  = Buffer.from(JSON.stringify({ alg: 'none', kid: 'test-kid' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(goodClaims())).toString('base64url');
    mockGoogle(`${header}.${payload}.`);
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('carries the unverified flag through rather than swallowing it', async () => {
    // exchangeCode reports what Google said; resolveIdentity is what refuses.
    mockGoogle(sign({ ...goodClaims(), email_verified: false }));
    await expect((await freshExchange())('code')).resolves.toMatchObject({ emailVerified: false });
  });

  it('fails the sign-in when Google rejects the code exchange', async () => {
    mockGoogle(undefined, false);
    await expect((await freshExchange())('code')).rejects.toMatchObject({ statusCode: 401 });
  });
});

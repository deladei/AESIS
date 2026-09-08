import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type JwtHeader } from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';

/**
 * Sign in with Google — authorization-code flow, verified server-side.
 *
 * The rule that shapes all of this: **Google proves an email address, it does
 * not grant membership.** AESIS is a supervised programme with roles,
 * placements and supervisor assignments, so a Google account by itself buys
 * nothing. An account is only created when the address is already on the class
 * roster a coordinator uploaded; anyone else is turned away and told who to
 * ask. Google is a convenience for people the department has already admitted.
 *
 * What is verified, and why each step is not optional:
 *
 * - **`state`**, random per attempt and held in an HttpOnly cookie, is compared
 *   on the way back. Without it a third party can hand a victim's browser a
 *   callback URL for an attacker's Google account and log them into it.
 * - **The code is exchanged server-to-server**, authenticated with the client
 *   secret. The browser never handles a token.
 * - **The ID token's signature is verified against Google's published keys**,
 *   then its issuer, audience and expiry are checked. An unverified JWT is
 *   just a base64 string anyone can type.
 * - **`email_verified` must be true.** Google will happily assert an
 *   unverified address, and matching an unverified address against the roster
 *   would let someone claim another student's place.
 */

const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI       = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS: [string, ...string[]] = ['https://accounts.google.com', 'accounts.google.com'];

export const STATE_COOKIE = 'aesis_oauth_state';
/** The round trip is a person clicking two buttons, not a session. */
export const STATE_TTL_MS = 10 * 60 * 1000;

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

function requireConfig() {
  if (!isGoogleConfigured()) {
    throw new AppError(503, 'Google sign-in is not configured on this server');
  }
  return {
    clientId:     env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    redirectUri:  env.GOOGLE_REDIRECT_URI!,
  };
}

/** A fresh `state` and the URL to send the browser to. */
export function buildAuthUrl(): { url: string; state: string } {
  const { clientId, redirectUri } = requireConfig();
  const state = crypto.randomBytes(32).toString('base64url');

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    // We want an identity, not ongoing access, so no refresh token is asked
    // for and nothing of Google's is stored.
    prompt:        'select_account',
  });

  return { url: `${AUTH_ENDPOINT}?${params}`, state };
}

interface GoogleIdentity {
  email:      string;
  firstName:  string;
  lastName:   string;
  emailVerified: boolean;
}

/** Google's signing keys. Cached briefly; they rotate, so this cannot be forever. */
let jwksCache: { keys: Record<string, crypto.KeyObject>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function signingKey(kid: string): Promise<crypto.KeyObject> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!fresh || !jwksCache!.keys[kid]) {
    const res = await fetch(JWKS_URI, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new AppError(502, 'Could not reach Google to verify the sign-in');
    const body = (await res.json()) as { keys: (crypto.JsonWebKey & { kid: string })[] };

    const keys: Record<string, crypto.KeyObject> = {};
    for (const jwk of body.keys ?? []) {
      // Node builds the public key straight from the JWK, so verifying
      // Google's signature needs no extra dependency.
      keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    }
    jwksCache = { keys, fetchedAt: Date.now() };
  }

  const key = jwksCache!.keys[kid];
  if (!key) throw new AppError(401, 'Google sign-in could not be verified');
  return key;
}

/** Exchange the one-time code and return the identity it proves. */
export async function exchangeCode(code: string): Promise<GoogleIdentity> {
  const { clientId, clientSecret, redirectUri } = requireConfig();

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    // Google's body names the cause (redirect_uri_mismatch, invalid_client);
    // it is operator detail, so it is logged and not returned to the browser.
    logger.warn('Google token exchange failed', { status: res.status, body: (await res.text()).slice(0, 300) });
    throw new AppError(401, 'Google sign-in failed');
  }

  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  if (!idToken) throw new AppError(401, 'Google sign-in failed');

  const header = jwt.decode(idToken, { complete: true })?.header as JwtHeader | undefined;
  if (!header?.kid) throw new AppError(401, 'Google sign-in could not be verified');

  const key = await signingKey(header.kid);
  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      issuer:     ISSUERS,
      audience:   clientId,
    }) as jwt.JwtPayload;
  } catch {
    throw new AppError(401, 'Google sign-in could not be verified');
  }

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email) throw new AppError(401, 'Google did not return an email address');

  return {
    email,
    emailVerified: claims.email_verified === true,
    firstName: typeof claims.given_name  === 'string' ? claims.given_name  : '',
    lastName:  typeof claims.family_name === 'string' ? claims.family_name : '',
  };
}

export type GoogleOutcome =
  | { kind: 'signed-in'; userId: string; role: string }
  | { kind: 'not-on-roster' };

/**
 * Resolve a verified Google identity to an AESIS account.
 *
 * Existing account → signed in, whatever their role. On the roster → a student
 * account is created and claims that roster row. Neither → refused.
 */
export async function resolveIdentity(identity: GoogleIdentity): Promise<GoogleOutcome> {
  if (!identity.emailVerified) {
    // Google asserts unverified addresses too, and matching one against the
    // roster would let someone claim another student's place.
    throw new AppError(401, 'Your Google email address is not verified');
  }

  const existing = await prisma.user.findUnique({ where: { email: identity.email } });
  if (existing) {
    // Google proved the address, so an account still waiting on an email link
    // is settled by this.
    if (!existing.isVerified) {
      await prisma.user.update({
        where: { id: existing.id },
        data:  { isVerified: true, verificationToken: null },
      });
    }
    return { kind: 'signed-in', userId: existing.id, role: existing.role };
  }

  const roster = await prisma.studentRoster.findFirst({
    where: { email: identity.email, claimedById: null },
  });
  if (!roster) return { kind: 'not-on-roster' };

  // Every user row needs a department. This is a Computer Science department
  // pilot and registration already refuses any programme outside it, so CS is
  // the only answer there is — it is not being guessed. The programme itself
  // is left null: the roster does not carry one, and inventing a programme for
  // a real student is worse than asking them for it, which the placement setup
  // does anyway.
  const department = await prisma.department.findFirst({ where: { code: 'CS' } });
  if (!department) {
    logger.error('Google sign-up cannot create a student: no CS department row exists');
    throw new AppError(503, 'Sign-up is unavailable right now');
  }

  // The roster is the department's record, so where the two disagree the
  // roster wins — the same rule registration already applies. A Google display
  // name is self-chosen; a roster name was entered by a coordinator.
  const created = await prisma.user.create({
    data: {
      email:       identity.email,
      firstName:   roster.firstName || identity.firstName || 'Student',
      lastName:    roster.lastName  || identity.lastName  || '',
      role:        'student',
      indexNumber: roster.indexNumber,
      departmentId: department.id,
      // Unguessable rather than empty: an empty hash is not a valid bcrypt
      // digest, and how a comparison treats one is a library detail this
      // should not depend on. Nobody knows this value, so password sign-in is
      // closed until they set one through the existing reset flow — which
      // emails the address Google just proved.
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS),
      isVerified:   true,
    },
    select: { id: true, role: true },
  });

  await prisma.studentRoster.update({
    where: { id: roster.id },
    data:  { claimedById: created.id, claimedAt: new Date() },
  });

  logger.info('Google sign-up matched the class roster', { userId: created.id, rosterId: roster.id });
  return { kind: 'signed-in', userId: created.id, role: created.role };
}

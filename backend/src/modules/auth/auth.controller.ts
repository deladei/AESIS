import { Request, Response } from 'express';
import multer from 'multer';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  resetPasswordInitSchema,
  resetPasswordConfirmSchema,
} from './auth.schema';
import * as authService from './auth.service';
import * as google from './google.service';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearCookieOptions,
} from '../../shared/utils/token';
import { created, ok } from '../../shared/utils/response';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

export async function registerHandler(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const user  = await authService.register(input);
  // The service knows whether this account was auto-verified (roster match,
  // mail disabled) — trust it rather than guessing from NODE_ENV, so the
  // client can show "check your inbox" only when a mail is actually coming.
  const message = user.requiresVerification
    ? 'Account created. Check your email for a verification link.'
    : 'Account created. You can now sign in.';
  return created(res, { message, userId: user.id, requiresVerification: user.requiresVerification });
}

export async function verifyEmailHandler(req: Request, res: Response) {
  const token  = req.query['token'];
  if (typeof token !== 'string') throw new AppError(400, 'Verification token is required');
  const result = await authService.verifyEmail(token);
  return ok(res, result);
}

export async function loginHandler(req: Request, res: Response) {
  // `email` is the field this endpoint took before sign-in accepted index
  // numbers. A browser holding a cached SPA bundle still sends it, and the
  // person behind it typed a perfectly good credential — rejecting them for
  // our rename would be an outage they cannot diagnose or fix.
  const body = req.body as Record<string, unknown>;
  const input = loginSchema.parse(
    body?.identifier === undefined && typeof body?.email === 'string'
      ? { ...body, identifier: body.email }
      : body,
  );
  const result = await authService.login(input, req.ip);

  res.cookie(
    REFRESH_COOKIE_NAME,
    result.refreshToken,
    refreshCookieOptions(env.REFRESH_TOKEN_EXPIRY_DAYS),
  );

  return ok(res, {
    accessToken: result.accessToken,
    user:        result.user,
  });
}

export async function refreshHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!rawToken) throw new AppError(401, 'No refresh token provided');

  const result = await authService.refresh(rawToken);

  res.cookie(
    REFRESH_COOKIE_NAME,
    result.refreshToken,
    refreshCookieOptions(env.REFRESH_TOKEN_EXPIRY_DAYS),
  );

  return ok(res, { accessToken: result.accessToken, user: result.user });
}

export async function logoutHandler(req: Request, res: Response) {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (rawToken) await authService.logout(rawToken);

  res.cookie(REFRESH_COOKIE_NAME, '', clearCookieOptions());
  return res.status(204).send();
}

export async function resetPasswordInitHandler(req: Request, res: Response) {
  const input  = resetPasswordInitSchema.parse(req.body);
  const result = await authService.resetPasswordInit(input);
  return ok(res, result);
}

export async function resetPasswordConfirmHandler(req: Request, res: Response) {
  const input  = resetPasswordConfirmSchema.parse(req.body);
  const result = await authService.resetPasswordConfirm(input);
  return ok(res, result);
}

export async function meHandler(req: Request, res: Response) {
  const userId = req.user!.sub;
  const profile = await authService.getProfile(userId);
  return ok(res, { profile });
}

export async function updateMeHandler(req: Request, res: Response) {
  const userId  = req.user!.sub;
  const input   = updateProfileSchema.parse(req.body);
  const profile = await authService.updateProfile(userId, input);
  return ok(res, { profile });
}

// Profile pictures only: JPG/PNG/WebP, 5 MB cap. Buffer stays in memory and is
// streamed straight to Cloudinary by the service — nothing touches local disk.
const AVATAR_MIME = ['image/png', 'image/jpeg', 'image/webp'];
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Only PNG, JPG, and WebP images are accepted'));
  },
});

export async function uploadAvatarHandler(req: Request, res: Response) {
  const userId = req.user!.sub;
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError(400, 'No image uploaded');

  const result = await authService.uploadAvatar(userId, {
    buffer: file.buffer,
    mimeType: file.mimetype,
  });
  return ok(res, result);
}

export async function removeAvatarHandler(req: Request, res: Response) {
  const userId = req.user!.sub;
  const result = await authService.removeAvatar(userId);
  return ok(res, result);
}

export async function programmesHandler(_req: Request, res: Response) {
  const programmes = await prisma.academicProgramme.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { programmes });
}


/**
 * Mark the first-run walkthrough as done.
 *
 * A POST with no body: the only fact being recorded is "this happened", and
 * the timestamp is the server's rather than the client's — a browser clock can
 * be wrong or lied about.
 */
export async function markOnboardedHandler(req: Request, res: Response) {
  const data = await authService.markOnboarded(req.user!.sub);
  return ok(res, data);
}

// ── Sign in with Google ───────────────────────────────────────

/**
 * Whether the button should be shown at all.
 *
 * The SPA asks rather than assuming, so an environment with no Google
 * credentials renders no button instead of one that dead-ends — which is the
 * difference between a feature that is off and a feature that is broken.
 */
export async function googleStatusHandler(_req: Request, res: Response) {
  res.json({ data: { configured: google.isGoogleConfigured() } });
}

/** Step 1 — hand the browser to Google, remembering `state`. */
export async function googleStartHandler(_req: Request, res: Response) {
  const { url, state } = google.buildAuthUrl();

  res.cookie(google.STATE_COOKIE, state, {
    httpOnly: true,
    secure:   env.NODE_ENV === 'production',
    // Lax, not Strict: this cookie has to survive Google redirecting the
    // browser back to us, which is a cross-site top-level navigation. Strict
    // withholds it there and every sign-in fails the state check.
    sameSite: 'lax',
    maxAge:   google.STATE_TTL_MS,
    path:     '/',
  });

  res.redirect(url);
}

/**
 * Step 2 — Google sends the browser back here.
 *
 * Ends in a redirect either way: the person is in a browser tab, not reading a
 * JSON body. Failures go back to the login page carrying a reason the SPA can
 * render, and never an error from Google verbatim.
 */
export async function googleCallbackHandler(req: Request, res: Response) {
  const fail = (reason: string) =>
    res.redirect(`${env.FRONTEND_URL}/auth/login?google=${encodeURIComponent(reason)}`);

  const { code, state } = req.query as { code?: string; state?: string };
  const expected = req.cookies?.[google.STATE_COOKIE];
  res.clearCookie(google.STATE_COOKIE, { path: '/' });

  // A missing or mismatched state is the attack this parameter exists to stop:
  // without it, a crafted callback URL logs a victim into someone else's
  // Google account.
  if (!code || !state || !expected || state !== expected) return fail('invalid_state');

  try {
    const identity = await google.exchangeCode(code);
    const outcome  = await google.resolveIdentity(identity);

    if (outcome.kind === 'not-on-roster') return fail('not_on_roster');

    const session = await authService.issueSessionForUser(outcome.userId);
    res.cookie(
      REFRESH_COOKIE_NAME,
      session.refreshToken,
      refreshCookieOptions(env.REFRESH_TOKEN_EXPIRY_DAYS),
    );

    // The access token is deliberately NOT in this URL: it would land in
    // browser history, the Referer header and any proxy log. The SPA trades
    // the refresh cookie for one on arrival, which is the path it already
    // uses on every reload.
    return res.redirect(`${env.FRONTEND_URL}/auth/callback`);
  } catch (err) {
    logger.warn('Google sign-in failed', { err: err instanceof Error ? err.message : String(err) });
    return fail('failed');
  }
}

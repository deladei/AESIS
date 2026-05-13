import { Request, Response } from 'express';
import {
  registerSchema,
  loginSchema,
  resetPasswordInitSchema,
  resetPasswordConfirmSchema,
} from './auth.schema';
import * as authService from './auth.service';
import {
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
  clearCookieOptions,
} from '../../shared/utils/token';
import { created, ok } from '../../shared/utils/response';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';

export async function registerHandler(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const user  = await authService.register(input);
  const message = env.NODE_ENV === 'development'
    ? 'Account created. You can now sign in.'
    : 'Account created. Check your email for a verification link.';
  return created(res, { message, userId: user.id });
}

export async function verifyEmailHandler(req: Request, res: Response) {
  const token  = req.query['token'];
  if (typeof token !== 'string') throw new AppError(400, 'Verification token is required');
  const result = await authService.verifyEmail(token);
  return ok(res, result);
}

export async function loginHandler(req: Request, res: Response) {
  const input  = loginSchema.parse(req.body);
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

  return ok(res, { accessToken: result.accessToken });
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

export async function programmesHandler(_req: Request, res: Response) {
  const programmes = await prisma.academicProgramme.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });
  return ok(res, { programmes });
}

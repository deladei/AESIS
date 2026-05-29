import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import {
  generateSecureToken,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '../../shared/utils/token';
import {
  sendEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
} from '../../shared/utils/email';
import type {
  RegisterInput,
  LoginInput,
  ResetPasswordInitInput,
  ResetPasswordConfirmInput,
} from './auth.schema';

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ── Register ─────────────────────────────────────────────────

export async function register(input: RegisterInput) {
  const { firstName, lastName, email, password, role, programmeId } = input;

  // Students must pick a CS programme; supervisors are department-wide.
  let departmentId: string | null = null;
  let resolvedProgrammeId: string | null = null;
  if (role === 'student') {
    const programme = await prisma.academicProgramme.findUnique({
      where: { id: programmeId! },
      include: { department: true },
    });
    if (!programme) throw new AppError(400, 'Invalid programme selected');
    if (programme.department.code !== 'CS') {
      throw new AppError(400, 'AESIS is restricted to the Computer Science department');
    }
    departmentId = programme.departmentId;
    resolvedProgrammeId = programme.id;
  } else {
    // Supervisors are attached to the CS department but not a specific programme.
    const csDept = await prisma.department.findUnique({ where: { code: 'CS' } });
    if (!csDept) throw new AppError(500, 'Computer Science department is not configured');
    departmentId = csDept.id;
  }

  // Unique email check
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, 'An account with this email already exists');

  const passwordHash       = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const verificationToken  = generateSecureToken();

  // Auto-verify whenever we can't reliably send a verification email — i.e.
  // dev (no SMTP) or prod without SENDGRID_API_KEY. Otherwise users would
  // register, never get the email, and be stuck unable to log in.
  const canSendEmail = env.NODE_ENV === 'production' && !!env.SENDGRID_API_KEY;
  const autoVerify  = !canSendEmail;

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      departmentId,
      programmeId:        resolvedProgrammeId,
      isVerified:         autoVerify,
      verificationToken:  autoVerify ? null : verificationToken,
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  if (!autoVerify) {
    await sendEmail({
      to:      email,
      subject: 'Verify your AESIS account',
      html:    buildVerificationEmail(`${firstName} ${lastName}`, verificationToken),
    });
  }

  return user;
}

// ── Verify Email ─────────────────────────────────────────────

export async function verifyEmail(token: string) {
  if (!token) throw new AppError(400, 'Verification token is required');

  const user = await prisma.user.findFirst({ where: { verificationToken: token } });
  if (!user) throw new AppError(400, 'Invalid or expired verification token');

  await prisma.user.update({
    where: { id: user.id },
    data:  { isVerified: true, verificationToken: null },
  });

  return { message: 'Email verified successfully. You can now sign in.' };
}

// ── Login ─────────────────────────────────────────────────────

export async function login(input: LoginInput, ipAddress?: string) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-time compare even if user not found — prevents timing attacks
  const dummyHash = '$2a$12$invalidhashforthesakeofconstanttimexxx';
  const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordMatch) {
    throw new AppError(401, 'Invalid email or password');
  }
  // Only gate on email verification when SendGrid is actually configured.
  // Otherwise users who registered before the auto-verify fix (or whose
  // verification email never arrived) would be permanently locked out.
  // On unlock-by-login, persist isVerified=true so the row stays clean.
  const canSendEmail = env.NODE_ENV === 'production' && !!env.SENDGRID_API_KEY;
  if (!user.isVerified) {
    if (canSendEmail) {
      throw new AppError(403, 'Please verify your email address before signing in');
    }
    await prisma.user.update({
      where: { id: user.id },
      data:  { isVerified: true, verificationToken: null },
    });
  }

  const accessToken               = signAccessToken({ sub: user.id, role: user.role });
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();

  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: refreshHash, expiresAt },
    }),
    prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    }),
  ]);

  return {
    accessToken,
    refreshToken: refreshRaw,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      role:      user.role,
    },
  };
}

// ── Refresh ───────────────────────────────────────────────────

export async function refresh(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findFirst({
    where:   { tokenHash },
    include: { user: { select: { id: true, role: true, isVerified: true } } },
  });

  if (!stored)                      throw new AppError(401, 'Invalid refresh token');
  if (stored.revokedAt)             throw new AppError(401, 'Refresh token has been revoked');
  if (stored.expiresAt < new Date()) throw new AppError(401, 'Refresh token has expired');

  // Rotate: revoke old, issue new
  const { raw: newRaw, hash: newHash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: { userId: stored.userId, tokenHash: newHash, expiresAt },
    }),
  ]);

  const accessToken = signAccessToken({ sub: stored.user.id, role: stored.user.role });

  return { accessToken, refreshToken: newRaw };
}

// ── Logout ────────────────────────────────────────────────────

export async function logout(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
}

// ── Reset Password — Initiate ─────────────────────────────────

export async function resetPasswordInit(input: ResetPasswordInitInput) {
  const { email } = input;

  // Always return the same message regardless of whether email exists (prevent enumeration)
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: 'If this email is registered you will receive a reset link' };

  const token   = generateSecureToken();
  const expiry  = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordResetToken: token, passwordResetExpiry: expiry },
  });

  await sendEmail({
    to:      email,
    subject: 'Reset your AESIS password',
    html:    buildPasswordResetEmail(`${user.firstName} ${user.lastName}`, token),
  });

  return { message: 'If this email is registered you will receive a reset link' };
}

// ── Reset Password — Confirm ──────────────────────────────────

export async function resetPasswordConfirm(input: ResetPasswordConfirmInput) {
  const { token, password } = input;

  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token },
  });

  if (!user) throw new AppError(400, 'Invalid or expired reset token');
  if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
    throw new AppError(400, 'Reset token has expired. Please request a new one.');
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data:  {
      passwordHash,
      passwordResetToken:  null,
      passwordResetExpiry: null,
    },
  });

  // Revoke all existing refresh tokens on password change
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data:  { revokedAt: new Date() },
  });

  return { message: 'Password reset successful. Please sign in with your new password.' };
}

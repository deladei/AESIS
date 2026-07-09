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
import { createPlacement } from '../placements/placements.service';
import { decryptPII, encryptPII } from '../../shared/utils/crypto';
import {
  isCloudinaryConfigured,
  uploadBuffer,
  deleteAsset,
} from '../../config/cloudinary';
import type {
  RegisterInput,
  LoginInput,
  UpdateProfileInput,
  ResetPasswordInitInput,
  ResetPasswordConfirmInput,
} from './auth.schema';

const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// ── Register ─────────────────────────────────────────────────

export async function register(input: RegisterInput) {
  const { firstName, lastName, email, password, role, programmeId, gender } = input;
  // Index number is a student-only identifier; ignore it for other roles.
  const indexNumber = role === 'student' ? input.indexNumber! : null;
  // Staff ID + title identify an academic supervisor; ignored for other roles.
  const staffId = role === 'academic_supervisor' ? input.staffId! : null;
  const title   = role === 'academic_supervisor' ? input.title!   : null;

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

  // Unique index-number check (students only).
  if (indexNumber) {
    const dupIndex = await prisma.user.findUnique({ where: { indexNumber } });
    if (dupIndex) throw new AppError(409, 'An account with this index number already exists');
  }

  // Unique staff-ID check (academic supervisors only) — one staff record can
  // never back two accounts.
  if (staffId) {
    const dupStaff = await prisma.user.findUnique({ where: { staffId } });
    if (dupStaff) throw new AppError(409, 'An account with this staff ID already exists');
  }

  const passwordHash       = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const verificationToken  = generateSecureToken();

  // Pre-registered class roster: if the coordinator uploaded this student
  // (matched by email or index number, unclaimed), the system already knows
  // them — link the account and skip email verification.
  let rosterMatch: { id: string } | null = null;
  if (role === 'student') {
    rosterMatch = await prisma.studentRoster.findFirst({
      where: {
        claimedById: null,
        OR: [
          { email },
          ...(indexNumber ? [{ indexNumber }] : []),
        ],
      },
      select: { id: true },
    });
  }

  // Auto-verify whenever we can't reliably send a verification email — i.e.
  // dev (no SMTP) or prod without SENDGRID_API_KEY. Otherwise users would
  // register, never get the email, and be stuck unable to log in.
  const canSendEmail = env.NODE_ENV === 'production' && !!env.SENDGRID_API_KEY;
  const autoVerify  = !canSendEmail || rosterMatch != null;

  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      gender,
      indexNumber,
      staffId,
      title,
      departmentId,
      programmeId:        resolvedProgrammeId,
      isVerified:         autoVerify,
      verificationToken:  autoVerify ? null : verificationToken,
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  // Students register with their full placement in one step: create it now as a
  // pending application awaiting coordinator approval (the regional supervisor
  // auto-balance happens at approval time, not here, so registration can't skip
  // the approval gate). If placement creation fails, roll the user back so the
  // account isn't left orphaned with no placement.
  if (role === 'student') {
    try {
      await createPlacement(user.id, {
        companyName:            input.companyName!,
        companyAddress:         input.companyAddress!,
        companySupervisorName:  input.companySupervisorName!,
        companySupervisorEmail: input.companySupervisorEmail!,
        region:                 input.region!,
        startDate:              input.startDate!,
        endDate:                input.endDate!,
      });
    } catch (err) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => { /* best-effort */ });
      throw err;
    }
  }

  // Claim the roster row once the account (and placement) exist. Best-effort:
  // a race on the unique claim must not fail the registration itself.
  if (rosterMatch) {
    await prisma.studentRoster
      .update({
        where: { id: rosterMatch.id },
        data: { claimedById: user.id, claimedAt: new Date() },
      })
      .catch(() => { /* best-effort */ });
  }

  if (!autoVerify) {
    await sendEmail({
      to:      email,
      subject: 'Verify your AESIS account',
      html:    buildVerificationEmail(`${firstName} ${lastName}`, verificationToken),
    });
  }

  // Tell the client whether a verification email is on its way, so the
  // success screen can say "check your inbox" instead of "sign in now".
  return { ...user, requiresVerification: !autoVerify };
}

// ── Profile (everything the system knows about the signed-in user) ───────────

// Best-effort decrypt: PII rows predating the current key (or plain placeholders)
// must not blow up the whole profile request.
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decryptPII(value); } catch { return null; }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: { select: { name: true, code: true } },
      programme:  { select: { name: true, code: true } },
    },
  });
  if (!user) throw new AppError(404, 'User not found');

  const base = {
    id:           user.id,
    firstName:    user.firstName,
    lastName:     user.lastName,
    email:        user.email,
    role:         user.role,
    avatarUrl:    user.avatarUrl,
    gender:       user.gender,
    indexNumber:  user.indexNumber,
    phone:        safeDecrypt(user.phone),
    isVerified:   user.isVerified,
    department:   user.department?.name ?? null,
    programme:    user.programme?.name ?? null,
    supervisedRegion: user.supervisedRegion,
    createdAt:    user.createdAt,
    lastLoginAt:  user.lastLoginAt,
    placement:    null as null | {
      id: string;
      status: string;
      region: string | null;
      startDate: Date | null;
      endDate: Date | null;
      companyName: string | null;
      companyAddress: string | null;
      companySupervisor: string | null;
      academicSupervisor: string | null;
    },
  };

  // Students carry a placement — surface the full record on the profile.
  if (user.role === 'student') {
    const placement = await prisma.placement.findFirst({
      where:   { studentId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        company:            { select: { name: true, address: true } },
        companySupervisor:  { select: { firstName: true, lastName: true } },
        academicSupervisor: { select: { firstName: true, lastName: true } },
      },
    });
    if (placement) {
      const fullName = (u: { firstName: string; lastName: string } | null) =>
        u ? `${u.firstName} ${u.lastName}`.trim() : null;
      base.placement = {
        id:                 placement.id,
        status:             placement.placementStatus,
        region:             placement.region,
        startDate:          placement.startDate,
        endDate:            placement.endDate,
        companyName:        placement.company?.name ?? null,
        companyAddress:     safeDecrypt(placement.company?.address),
        companySupervisor:  fullName(placement.companySupervisor),
        academicSupervisor: fullName(placement.academicSupervisor),
      };
    }
  }

  return base;
}

// ── Update profile (self-service) ────────────────────────────────────────────

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const data: {
    firstName?: string;
    lastName?: string;
    gender?: 'male' | 'female' | 'other';
    phone?: string | null;
    indexNumber?: string | null;
  } = {};

  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName  !== undefined) data.lastName  = input.lastName;
  if (input.gender    !== undefined) data.gender    = input.gender;

  // Phone is PII — encrypt at rest. An empty string clears it (stored NULL).
  if (input.phone !== undefined) {
    data.phone = input.phone === '' ? null : encryptPII(input.phone);
  }

  // Index number is a student-only identifier and unique. Silently ignore it for
  // other roles (the body can't elevate a non-student into having one).
  if (input.indexNumber !== undefined && user.role === 'student') {
    if (input.indexNumber !== user.indexNumber) {
      const dupIndex = await prisma.user.findUnique({ where: { indexNumber: input.indexNumber } });
      if (dupIndex && dupIndex.id !== userId) {
        throw new AppError(409, 'An account with this index number already exists');
      }
    }
    data.indexNumber = input.indexNumber;
  }

  if (Object.keys(data).length > 0) {
    await prisma.user.update({ where: { id: userId }, data });
  }

  return getProfile(userId);
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

export async function login(input: LoginInput, _ipAddress?: string) {
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
      avatarUrl: user.avatarUrl,
    },
  };
}

// ── Refresh ───────────────────────────────────────────────────

export async function refresh(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findFirst({
    where:   { tokenHash },
    include: {
      user: {
        select: {
          id: true, role: true, isVerified: true,
          email: true, firstName: true, lastName: true, avatarUrl: true,
        },
      },
    },
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

  return {
    accessToken,
    refreshToken: newRaw,
    user: {
      id:        stored.user.id,
      email:     stored.user.email,
      firstName: stored.user.firstName,
      lastName:  stored.user.lastName,
      role:      stored.user.role,
      avatarUrl: stored.user.avatarUrl,
    },
  };
}

// ── Avatar (profile picture) ──────────────────────────────────

export interface AvatarFile {
  buffer: Buffer;
  mimeType: string;
}

/**
 * Upload (or replace) a user's profile picture. The Cloudinary public_id is the
 * user id, so a re-upload overwrites the previous image in place — every user
 * keeps exactly one avatar, no orphans accumulate. Returns the new avatarUrl.
 */
export async function uploadAvatar(userId: string, file: AvatarFile) {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'Image storage is not configured; uploads are unavailable');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  const asset = await uploadBuffer(file.buffer, {
    folder: 'aesis/avatars',
    isImage: true,
    publicId: userId,
    overwrite: true,
  });

  await prisma.user.update({
    where: { id: userId },
    data:  { avatarUrl: asset.url },
  });

  return { avatarUrl: asset.url };
}

/**
 * Remove a user's profile picture: best-effort delete of the remote asset, then
 * clear the column. The DB row is the system of record, so a remote hiccup
 * never blocks the clear.
 */
export async function removeAvatar(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');

  if (user.avatarUrl) {
    await deleteAsset(`aesis/avatars/${userId}`, true);
    await prisma.user.update({
      where: { id: userId },
      data:  { avatarUrl: null },
    });
  }

  return { avatarUrl: null as string | null };
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

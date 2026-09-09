import crypto from 'node:crypto';
import type { UserRole } from '@prisma/client';
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
  canSendEmail,
  buildVerificationEmail,
  buildPasswordResetEmail,
} from '../../shared/utils/email';
import { createPlacement } from '../placements/placements.service';
import { createNotification } from '../notifications/notifications.service';
import { logger } from '../../config/logger';
import { decryptPII, encryptPII } from '../../shared/utils/crypto';
import { looksLikeEmail } from '../../shared/validation/auth';
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

/**
 * Gate on System Admin self-registration.
 *
 * The sign-up page is public, so without this anyone who found the URL could
 * create an account with break-glass rights over every placement, grade and
 * logbook in the system.
 *
 * FAILS CLOSED. An unset `ADMIN_SETUP_CODE` refuses admin registration rather
 * than waving it through — the dangerous reading of a missing secret is "no
 * gate", and that is exactly the deployment where it would be missing.
 *
 * Compared in constant time so a wrong code cannot be discovered a character at
 * a time from response timing.
 */
function assertAdminSetupCode(supplied: string | undefined): void {
  const expected = env.ADMIN_SETUP_CODE;
  if (!expected) {
    logger.error('Admin self-registration attempted but ADMIN_SETUP_CODE is not set');
    throw new AppError(403, 'Administrator accounts cannot be created on this server');
  }

  const a = Buffer.from(supplied ?? '');
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are folded into the same boolean.
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    logger.warn('Admin self-registration refused: wrong setup code');
    throw new AppError(403, 'That setup code is not valid');
  }
}

export async function register(input: RegisterInput) {
  const { firstName, lastName, email, password, role, programmeId, gender } = input;

  // Before anything is written, and before the email is even looked up: a
  // failed gate must not tell an attacker whether an address is registered.
  if (role === 'admin') assertAdminSetupCode(input.setupCode);
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
  let rosterMatch: {
    id: string; firstName: string; lastName: string; indexNumber: string | null; email: string;
  } | null = null;
  if (role === 'student') {
    rosterMatch = await prisma.studentRoster.findFirst({
      where: {
        claimedById: null,
        OR: [
          { email },
          ...(indexNumber ? [{ indexNumber }] : []),
        ],
      },
      select: { id: true, firstName: true, lastName: true, indexNumber: true, email: true },
    });
  }

  // The roster is the department's own record, so where it disagrees with the
  // form it wins — a student typing their own name differently, or mistyping
  // their index number, should not create a second identity the coordinator
  // then has to reconcile by hand. The match itself is only ever made on an
  // exact email or index number, so this cannot rename the wrong person.
  //
  // Every correction is recorded so nothing is silently rewritten under them.
  const rosterCorrections: { field: string; submitted: string; roster: string }[] = [];
  if (rosterMatch) {
    const fix = (field: string, submitted: string, roster: string) => {
      if (roster && submitted.trim().toLowerCase() !== roster.trim().toLowerCase()) {
        rosterCorrections.push({ field, submitted, roster });
      }
    };
    fix('firstName', firstName, rosterMatch.firstName);
    fix('lastName', lastName, rosterMatch.lastName);
    if (rosterMatch.indexNumber) fix('indexNumber', indexNumber ?? '', rosterMatch.indexNumber);
  }
  const resolvedFirstName   = rosterMatch?.firstName   || firstName;
  const resolvedLastName    = rosterMatch?.lastName    || lastName;
  const resolvedIndexNumber = rosterMatch?.indexNumber || indexNumber;

  // Auto-verify whenever we can't reliably send a verification email — i.e.
  // dev, or prod with no mail provider configured. Otherwise users would
  // register, never get the email, and be stuck unable to log in.
  const autoVerify = !canSendEmail() || rosterMatch != null;

  const user = await prisma.user.create({
    data: {
      firstName: resolvedFirstName,
      lastName:  resolvedLastName,
      email,
      passwordHash,
      role,
      gender,
      indexNumber: resolvedIndexNumber,
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

    // A mismatch is worth a human's attention: it is either a typo the student
    // made or a stale roster row. The account is created either way — blocking
    // registration over a middle name would be worse — but the coordinator is
    // told, with both values, so they can decide which is right.
    if (rosterCorrections.length > 0) {
      logger.warn('Registration differed from the class roster', {
        userId: user.id, email, corrections: rosterCorrections,
      });
      const coordinators = await prisma.user.findMany({
        where:  { role: 'coordinator' },
        select: { id: true },
      }).catch(() => []);
      const detail = rosterCorrections
        .map(c => `${c.field}: typed "${c.submitted}", roster says "${c.roster}"`)
        .join('; ');
      for (const c of coordinators) {
        await createNotification({
          userId: c.id,
          type:   'system',
          title:  `Roster mismatch for ${resolvedFirstName} ${resolvedLastName}`,
          body:   `${email} registered with details that differ from the class roster. ${detail}. The roster values were used.`,
          link:   '/coordinator/interns',
          metadata: { kind: 'roster_mismatch', userId: user.id, corrections: rosterCorrections },
        }).catch(() => { /* best-effort */ });
      }
    }
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
    // Null until the student finishes the first-run walkthrough. The SPA shows
    // it while this is null, so it survives a new device or a cleared browser.
    onboardedAt:  user.onboardedAt,
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

/**
 * The one place a session is minted.
 *
 * Every authenticated entry point ends here — password login and Google
 * sign-in both — so there is a single token shape, a single refresh row and a
 * single `lastLoginAt` write. Two session issuers is how one of them quietly
 * stops matching the other; that is exactly how `avatarUrl` would go missing
 * from one sign-in path and not the other.
 *
 * It performs NO authentication of its own. Callers must have established who
 * the user is first.
 */
async function issueSession(user: {
  id: string; email: string; firstName: string; lastName: string;
  role: UserRole; avatarUrl: string | null;
}) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
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

/**
 * Issue a session for a user id whose identity some other flow has already
 * proved — Google sign-in, which verified the ID token before calling this.
 */
export async function issueSessionForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, email: true, firstName: true,
      lastName: true, role: true, avatarUrl: true,
    },
  });
  if (!user) throw new AppError(401, 'Invalid credentials');

  return issueSession(user);
}

/**
 * Find the account behind an email address or a student index number.
 *
 * Which one it is is decided by looking at the value, so a student never has to
 * classify their own credential before typing it. Index numbers are matched
 * case-insensitively — they are printed on cards and read off them, and
 * `ug/12345` and `UG/12345` are the same student.
 *
 * Email stays an exact match on the normalised (lower-cased) column, which is
 * how every other lookup in this service treats it.
 */
async function findByIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;

  if (looksLikeEmail(value)) {
    return prisma.user.findUnique({ where: { email: value.toLowerCase() } });
  }

  return prisma.user.findFirst({
    where: { indexNumber: { equals: value, mode: 'insensitive' } },
  });
}

export async function login(input: LoginInput, _ipAddress?: string) {
  const { identifier, password } = input;

  const user = await findByIdentifier(identifier);
  // Constant-time compare even if user not found — prevents timing attacks
  const dummyHash = '$2a$12$invalidhashforthesakeofconstanttimexxx';
  const passwordMatch = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !passwordMatch) {
    // One message for every failure. Saying "no account with that index number"
    // would turn the login form into a lookup for who is enrolled.
    throw new AppError(401, 'Invalid credentials');
  }
  // Only gate on email verification when mail is actually being delivered.
  // Otherwise users who registered before the auto-verify fix (or whose
  // verification email never arrived) would be permanently locked out.
  // On unlock-by-login, persist isVerified=true so the row stays clean.
  if (!user.isVerified) {
    if (canSendEmail()) {
      throw new AppError(403, 'Please verify your email address before signing in');
    }
    await prisma.user.update({
      where: { id: user.id },
      data:  { isVerified: true, verificationToken: null },
    });
  }

  return issueSession(user);
}

/**
 * Record that the student has finished the first-run logbook walkthrough.
 *
 * Idempotent: the first call wins and later ones leave the original timestamp
 * alone, so re-opening the walkthrough deliberately (or a double-clicked
 * "Get started") cannot rewrite when they actually completed it.
 *
 * Deliberately not restricted to students. Nothing is shown to other roles, so
 * a guard here would only add a way for the call to fail; storing a timestamp
 * for someone who will never be asked again is harmless.
 */
export async function markOnboarded(userId: string) {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { onboardedAt: true },
  });
  if (!user) throw new AppError(404, 'User not found');

  if (user.onboardedAt) return { onboardedAt: user.onboardedAt };

  const updated = await prisma.user.update({
    where:  { id: userId },
    data:   { onboardedAt: new Date() },
    select: { onboardedAt: true },
  });
  return { onboardedAt: updated.onboardedAt };
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

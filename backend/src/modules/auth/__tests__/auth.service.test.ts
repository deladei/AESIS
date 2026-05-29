import bcrypt from 'bcryptjs';
import { AppError } from '../../../middleware/errorHandler';

// ── Mock all external dependencies ───────────────────────────
jest.mock('../../../config/prisma', () => ({
  prisma: {
    academicProgramme: { findUnique: jest.fn() },
    user:              { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    refreshToken:      { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction:      jest.fn(),
  },
}));

jest.mock('../../../shared/utils/email', () => ({
  sendEmail:                jest.fn().mockResolvedValue(undefined),
  buildVerificationEmail:   jest.fn().mockReturnValue('<html>verify</html>'),
  buildPasswordResetEmail:  jest.fn().mockReturnValue('<html>reset</html>'),
}));

jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:                  'test',
    BCRYPT_ROUNDS:             4, // low cost for tests
    REFRESH_TOKEN_EXPIRY_DAYS: 7,
    JWT_SECRET:                'test_secret_at_least_32_characters_long',
    JWT_EXPIRY:                '15m',
    FRONTEND_URL:              'http://localhost:5173',
    EMAIL_FROM:                'test@aesis.edu',
    EMAIL_FROM_NAME:           'AESIS Test',
  },
}));

import { prisma } from '../../../config/prisma';
import * as authService from '../auth.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper: build a fake user
const fakeUser = (overrides = {}) => ({
  id:                  'user-uuid-1',
  email:               'student@cs.edu',
  firstName:           'Ada',
  lastName:            'Okonkwo',
  role:                'student',
  passwordHash:        bcrypt.hashSync('Password@123', 4),
  isVerified:          true,
  verificationToken:   null,
  passwordResetToken:  null,
  passwordResetExpiry: null,
  ...overrides,
});

const fakeProgramme = {
  id:           'prog-uuid-1',
  name:         'B.Sc. Computer Science',
  code:         'BSC-CS',
  departmentId: 'dept-uuid-1',
  department:   { id: 'dept-uuid-1', name: 'Computer Science', code: 'CS', createdAt: new Date() },
};

// ─────────────────────────────────────────────────────────────
describe('authService.register', () => {
  const validInput = {
    firstName:   'Ada',
    lastName:    'Okonkwo',
    email:       'student@cs.edu',
    password:    'Password@123',
    role:        'student' as const,
    programmeId: 'prog-uuid-1',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a new user and returns safe fields', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', email: validInput.email,
      firstName: 'Ada', lastName: 'Okonkwo', role: 'student',
    });

    const result = await authService.register(validInput);

    expect(result).toMatchObject({ email: validInput.email, role: 'student' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws 400 if programme does not exist', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(authService.register(validInput)).rejects.toThrow(AppError);
    await expect(authService.register(validInput)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 if programme is outside CS dept', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue({
      ...fakeProgramme,
      department: { ...fakeProgramme.department, code: 'EE' },
    });
    await expect(authService.register(validInput)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 if email already exists', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser());
    await expect(authService.register(validInput)).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns accessToken and user on valid credentials', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser());
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.login({ email: 'student@cs.edu', password: 'Password@123' });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user.email).toBe('student@cs.edu');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('throws 401 for wrong password', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser());
    await expect(
      authService.login({ email: 'student@cs.edu', password: 'WrongPassword' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for non-existent email', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      authService.login({ email: 'nobody@cs.edu', password: 'Password@123' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 403 if email not verified', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser({ isVerified: false }));
    await expect(
      authService.login({ email: 'student@cs.edu', password: 'Password@123' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.verifyEmail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies the user and clears the token', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(fakeUser({ verificationToken: 'valid-token' }));
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.verifyEmail('valid-token');
    expect(result.message).toMatch(/verified/i);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isVerified: true, verificationToken: null }) })
    );
  });

  it('throws 400 for unknown token', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(authService.verifyEmail('bad-token')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for empty token', async () => {
    await expect(authService.verifyEmail('')).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 401 for unknown token', async () => {
    (mockPrisma.refreshToken.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(authService.refresh('unknown-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for revoked token', async () => {
    (mockPrisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
      id: 'rt-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 999999),
      user: { id: 'user-uuid-1', role: 'student', isVerified: true },
    });
    await expect(authService.refresh('any-token')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 for expired token', async () => {
    (mockPrisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
      id: 'rt-1', revokedAt: null, expiresAt: new Date(Date.now() - 1000),
      user: { id: 'user-uuid-1', role: 'student', isVerified: true },
    });
    await expect(authService.refresh('any-token')).rejects.toMatchObject({ statusCode: 401 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.resetPasswordInit', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns generic message even when email not found (prevents enumeration)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await authService.resetPasswordInit({ email: 'nobody@cs.edu' });
    expect(result.message).toMatch(/if this email/i);
  });

  it('stores reset token and sends email for known user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser());
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.resetPasswordInit({ email: 'student@cs.edu' });
    expect(result.message).toMatch(/if this email/i);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordResetToken: expect.any(String) }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.resetPasswordConfirm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resets password for valid non-expired token', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(
      fakeUser({ passwordResetToken: 'valid-token', passwordResetExpiry: new Date(Date.now() + 60000) })
    );
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.updateMany as jest.Mock).mockResolvedValue({});

    const result = await authService.resetPasswordConfirm({ token: 'valid-token', password: 'NewPass@123' });
    expect(result.message).toMatch(/reset successful/i);
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalled(); // revokes all sessions
  });

  it('throws 400 for expired token', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(
      fakeUser({ passwordResetToken: 'stale', passwordResetExpiry: new Date(Date.now() - 1000) })
    );
    await expect(
      authService.resetPasswordConfirm({ token: 'stale', password: 'NewPass@123' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for unknown token', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      authService.resetPasswordConfirm({ token: 'unknown', password: 'NewPass@123' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

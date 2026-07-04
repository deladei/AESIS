import bcrypt from 'bcryptjs';
import { AppError } from '../../../middleware/errorHandler';

// ── Mock all external dependencies ───────────────────────────
jest.mock('../../../config/prisma', () => ({
  prisma: {
    academicProgramme: { findUnique: jest.fn() },
    department:        { findUnique: jest.fn() },
    user:              { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    placement:         { findFirst: jest.fn() },
    refreshToken:      { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    studentRoster:     { findFirst: jest.fn(), update: jest.fn() },
    $transaction:      jest.fn(),
  },
}));

jest.mock('../../../shared/utils/email', () => ({
  sendEmail:                jest.fn().mockResolvedValue(undefined),
  buildVerificationEmail:   jest.fn().mockReturnValue('<html>verify</html>'),
  buildPasswordResetEmail:  jest.fn().mockReturnValue('<html>reset</html>'),
}));

// Student registration now creates the placement + auto-assigns a regional
// supervisor; that path is unit-tested in placements.service.test.ts. Here we
// only assert the user side, so stub it out.
jest.mock('../../placements/placements.service', () => ({
  createPlacement: jest.fn().mockResolvedValue({ id: 'placement-uuid-1' }),
}));

jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:                  'test',
    BCRYPT_ROUNDS:             4, // low cost for tests
    REFRESH_TOKEN_EXPIRY_DAYS: 7,
    JWT_SECRET:                'test_secret_at_least_32_characters_long',
    JWT_EXPIRY:                '15m',
    ENCRYPTION_KEY:            '0'.repeat(64), // 32-byte hex key for AES-256-GCM

    FRONTEND_URL:              'http://localhost:5173',
    EMAIL_FROM:                'test@aesis.edu',
    EMAIL_FROM_NAME:           'AESIS Test',
  },
}));

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(),
  uploadBuffer:           jest.fn(),
  deleteAsset:            jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../../config/prisma';
import * as cloudinary from '../../../config/cloudinary';
import * as authService from '../auth.service';

const mockCloud = cloudinary as jest.Mocked<typeof cloudinary>;

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
    gender:      'female' as const,
    indexNumber: '10543210',
    programmeId: 'prog-uuid-1',
    region:                 'greater_accra' as const,
    companyName:            'TechBridge Ghana',
    companyAddress:         '12 Liberation Road, Accra',
    companySupervisorName:  'Kwabena Mensah',
    companySupervisorEmail: 'kwabena@techbridge.com',
    startDate:              '2026-07-01',
    endDate:                '2026-09-30',
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

  it('throws 409 if index number already exists', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    // First findUnique = email lookup (free), second = index-number lookup (taken).
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeUser({ indexNumber: '10543210' }));
    await expect(authService.register(validInput)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('persists gender and index number on the created student', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', email: validInput.email, firstName: 'Ada', lastName: 'Okonkwo', role: 'student',
    });

    await authService.register(validInput);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gender: 'female', indexNumber: '10543210' }) }),
    );
  });

  it('links a class-roster row (matched by email/index) and auto-verifies the student', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.studentRoster.findFirst as jest.Mock).mockResolvedValue({ id: 'roster-uuid-1' });
    (mockPrisma.studentRoster.update as jest.Mock).mockResolvedValue({ id: 'roster-uuid-1' });
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', email: validInput.email, firstName: 'Ada', lastName: 'Okonkwo', role: 'student',
    });

    await authService.register(validInput);

    // The roster lookup only considers unclaimed rows matching email or index.
    expect(mockPrisma.studentRoster.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          claimedById: null,
          OR: [{ email: validInput.email }, { indexNumber: validInput.indexNumber }],
        }),
      }),
    );
    // Roster-matched students are auto-verified — the coordinator vouched for them.
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isVerified: true, verificationToken: null }) }),
    );
    // And the row is claimed by the new account.
    expect(mockPrisma.studentRoster.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'roster-uuid-1' },
        data: expect.objectContaining({ claimedById: 'user-uuid-1', claimedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not consult the roster for non-student roles', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-2', email: 'sup@cs.edu', firstName: 'K', lastName: 'M', role: 'academic_supervisor',
    });
    // Non-student path needs the CS department lookup.
    (mockPrisma.department.findUnique as jest.Mock).mockResolvedValue({ id: 'dept-uuid-1', code: 'CS' });

    await authService.register({
      firstName: 'Kwabena', lastName: 'Mensah', email: 'sup@cs.edu',
      password: 'Password@123', role: 'academic_supervisor' as const,
    } as never);

    expect(mockPrisma.studentRoster.findFirst).not.toHaveBeenCalled();
  });

  const supervisorInput = {
    firstName: 'Kwabena', lastName: 'Mensah', email: 'kmensah@cs.edu',
    password: 'Password@123', role: 'academic_supervisor' as const,
    gender: 'male' as const, staffId: 'STF-2041', title: 'Dr.',
  } as never;

  it('persists staffId and title on the created academic supervisor', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.department.findUnique as jest.Mock).mockResolvedValue({ id: 'dept-uuid-1', code: 'CS' });
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-3', email: 'kmensah@cs.edu', firstName: 'Kwabena', lastName: 'Mensah', role: 'academic_supervisor',
    });

    await authService.register(supervisorInput);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffId: 'STF-2041', title: 'Dr.' }) }),
    );
  });

  it('throws 409 if staff ID already exists', async () => {
    (mockPrisma.department.findUnique as jest.Mock).mockResolvedValue({ id: 'dept-uuid-1', code: 'CS' });
    // First findUnique = email lookup (free), second = staff-ID lookup (taken).
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fakeUser({ staffId: 'STF-2041' }));
    await expect(authService.register(supervisorInput)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('ignores staffId and title for student registrations', async () => {
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', email: validInput.email, firstName: 'Ada', lastName: 'Okonkwo', role: 'student',
    });

    await authService.register({ ...validInput, staffId: 'STF-9999', title: 'Dr.' } as never);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffId: null, title: null }) }),
    );
  });

  it('reports requiresVerification=false when the account is auto-verified', async () => {
    // Test env has no SendGrid key, so registration auto-verifies.
    (mockPrisma.academicProgramme.findUnique as jest.Mock).mockResolvedValue(fakeProgramme);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', email: validInput.email, firstName: 'Ada', lastName: 'Okonkwo', role: 'student',
    });

    const result = await authService.register(validInput);

    expect(result.requiresVerification).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.getProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 404 when the user does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(authService.getProfile('missing-id')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the student profile with the latest placement', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', firstName: 'Ada', lastName: 'Okonkwo', email: 'student@cs.edu',
      role: 'student', gender: 'female', indexNumber: '10543210', phone: null,
      isVerified: true, supervisedRegion: null, createdAt: new Date(), lastLoginAt: null,
      department: { name: 'Computer Science', code: 'CS' },
      programme:  { name: 'B.Sc. Computer Science', code: 'BSC-CS' },
    });
    (mockPrisma.placement.findFirst as jest.Mock).mockResolvedValue({
      id: 'placement-uuid-1', placementStatus: 'active', region: 'greater_accra',
      startDate: new Date('2026-07-01'), endDate: new Date('2026-09-30'),
      company: { name: 'TechBridge Ghana', address: null },
      companySupervisor:  { firstName: 'Kwabena', lastName: 'Mensah' },
      academicSupervisor: { firstName: 'Akua', lastName: 'Boateng' },
    });

    const profile = await authService.getProfile('user-uuid-1');

    expect(profile).toMatchObject({
      role: 'student', gender: 'female', indexNumber: '10543210',
      department: 'Computer Science', programme: 'B.Sc. Computer Science',
    });
    expect(profile.placement).toMatchObject({
      status: 'active', region: 'greater_accra', companyName: 'TechBridge Ghana',
      companySupervisor: 'Kwabena Mensah', academicSupervisor: 'Akua Boateng',
    });
  });

  it('does not look up a placement for non-student roles', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'sup-1', firstName: 'Akua', lastName: 'Boateng', email: 'sup@cs.edu',
      role: 'academic_supervisor', gender: 'female', indexNumber: null, phone: null,
      isVerified: true, supervisedRegion: 'greater_accra', createdAt: new Date(), lastLoginAt: null,
      department: { name: 'Computer Science', code: 'CS' }, programme: null,
    });

    const profile = await authService.getProfile('sup-1');

    expect(profile.placement).toBeNull();
    expect(mockPrisma.placement.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.updateProfile', () => {
  beforeEach(() => jest.clearAllMocks());

  // getProfile is exercised on the return path; give it enough to not throw.
  const stubProfileRead = (overrides = {}) => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-uuid-1', firstName: 'Ada', lastName: 'Okonkwo', email: 'student@cs.edu',
      role: 'student', gender: 'female', indexNumber: '10543210', phone: null,
      isVerified: true, supervisedRegion: null, createdAt: new Date(), lastLoginAt: null,
      department: { name: 'Computer Science', code: 'CS' },
      programme:  { name: 'B.Sc. Computer Science', code: 'BSC-CS' },
      ...overrides,
    });
    (mockPrisma.placement.findFirst as jest.Mock).mockResolvedValue(null);
  };

  it('throws 404 when the user does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(authService.updateProfile('missing-id', { firstName: 'Nia' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('updates name + gender', async () => {
    stubProfileRead();
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await authService.updateProfile('user-uuid-1', { firstName: 'Nia', gender: 'other' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Nia', gender: 'other' } }),
    );
  });

  it('encrypts phone (not stored in plaintext) and clears it on empty string', async () => {
    stubProfileRead();
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await authService.updateProfile('user-uuid-1', { phone: '+233201234567' });
    const setPhone = (mockPrisma.user.update as jest.Mock).mock.calls[0][0].data.phone as string;
    expect(setPhone).not.toContain('+233201234567');
    expect(JSON.parse(setPhone)).toHaveProperty('ciphertext');

    jest.clearAllMocks();
    stubProfileRead();
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    await authService.updateProfile('user-uuid-1', { phone: '' });
    expect((mockPrisma.user.update as jest.Mock).mock.calls[0][0].data).toEqual({ phone: null });
  });

  it('rejects a duplicate index number with 409', async () => {
    // first findUnique = the user being edited; second = the dup lookup.
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'user-uuid-1', role: 'student', indexNumber: '10543210' })
      .mockResolvedValueOnce({ id: 'someone-else', indexNumber: '99999999' });

    await expect(authService.updateProfile('user-uuid-1', { indexNumber: '99999999' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('ignores indexNumber for non-student roles', async () => {
    stubProfileRead({ id: 'sup-1', role: 'academic_supervisor', indexNumber: null });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    await authService.updateProfile('sup-1', { indexNumber: '12345', firstName: 'Akua' });

    // only the name change is applied — indexNumber is dropped for non-students.
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Akua' } }),
    );
    const writtenData = (mockPrisma.user.update as jest.Mock).mock.calls[0][0].data;
    expect(writtenData).not.toHaveProperty('indexNumber');
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

  it('auto-unlocks an unverified user when SendGrid is not configured', async () => {
    // env mock has NODE_ENV='test' + no SENDGRID_API_KEY → canSendEmail=false,
    // so the verification gate is skipped and the row is repaired in-flight.
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser({ isVerified: false }));
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.login({ email: 'student@cs.edu', password: 'Password@123' });

    expect(result).toHaveProperty('accessToken');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isVerified: true, verificationToken: null }) })
    );
  });

  it('throws 403 for unverified user when SendGrid is configured (prod with mail)', async () => {
    // Re-import the service against an env where the verification gate IS active.
    jest.resetModules();
    jest.doMock('../../../config/env', () => ({
      env: {
        NODE_ENV:                  'production',
        SENDGRID_API_KEY:          'SG.fake-for-test',
        BCRYPT_ROUNDS:             4,
        REFRESH_TOKEN_EXPIRY_DAYS: 7,
        JWT_SECRET:                'test_secret_at_least_32_characters_long',
        JWT_EXPIRY:                '15m',
        FRONTEND_URL:              'http://localhost:5173',
        EMAIL_FROM:                'test@aesis.edu',
        EMAIL_FROM_NAME:           'AESIS Test',
      },
    }));
    const prodAuthService = await import('../auth.service');
    const { prisma: prodPrisma } = await import('../../../config/prisma');
    (prodPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser({ isVerified: false }));

    await expect(
      prodAuthService.login({ email: 'student@cs.edu', password: 'Password@123' })
    ).rejects.toMatchObject({ statusCode: 403 });

    jest.dontMock('../../../config/env');
    jest.resetModules();
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

  it('rotates the token and returns accessToken + full user (rehydrates session on refresh)', async () => {
    (mockPrisma.refreshToken.findFirst as jest.Mock).mockResolvedValue({
      id: 'rt-1', userId: 'user-uuid-1', revokedAt: null,
      expiresAt: new Date(Date.now() + 999999),
      user: {
        id: 'user-uuid-1', role: 'student', isVerified: true,
        email: 'kofi@cs.edu', firstName: 'Kofi', lastName: 'Mensah',
      },
    });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([{}, {}]);

    const result = await authService.refresh('valid-token');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    // The frontend's silent-refresh rehydrate needs the user; missing it logged
    // every user out on page refresh.
    expect(result.user).toEqual({
      id: 'user-uuid-1', email: 'kofi@cs.edu',
      firstName: 'Kofi', lastName: 'Mensah', role: 'student',
    });
  });

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

// ─────────────────────────────────────────────────────────────
describe('authService.uploadAvatar', () => {
  beforeEach(() => jest.clearAllMocks());
  const file = { buffer: Buffer.from('img'), mimeType: 'image/png' };

  it('throws 503 when image storage is not configured', async () => {
    (mockCloud.isCloudinaryConfigured as jest.Mock).mockReturnValue(false);
    await expect(authService.uploadAvatar('user-uuid-1', file))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(mockCloud.uploadBuffer).not.toHaveBeenCalled();
  });

  it('throws 404 when the user does not exist', async () => {
    (mockCloud.isCloudinaryConfigured as jest.Mock).mockReturnValue(true);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(authService.uploadAvatar('ghost', file))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('uploads under a fixed per-user public_id and persists the secure URL', async () => {
    (mockCloud.isCloudinaryConfigured as jest.Mock).mockReturnValue(true);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser());
    (mockCloud.uploadBuffer as jest.Mock).mockResolvedValue({
      url: 'https://cdn/avatar.png', publicId: 'aesis/avatars/user-uuid-1', bytes: 3,
    });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.uploadAvatar('user-uuid-1', file);

    expect(result).toEqual({ avatarUrl: 'https://cdn/avatar.png' });
    expect(mockCloud.uploadBuffer).toHaveBeenCalledWith(
      file.buffer,
      expect.objectContaining({ folder: 'aesis/avatars', publicId: 'user-uuid-1', overwrite: true, isImage: true }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarUrl: 'https://cdn/avatar.png' } }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('authService.removeAvatar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 404 when the user does not exist', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(authService.removeAvatar('ghost')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes the remote asset and clears the column when one exists', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser({ avatarUrl: 'https://cdn/avatar.png' }));
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await authService.removeAvatar('user-uuid-1');

    expect(result).toEqual({ avatarUrl: null });
    expect(mockCloud.deleteAsset).toHaveBeenCalledWith('aesis/avatars/user-uuid-1', true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarUrl: null } }),
    );
  });

  it('is a no-op delete when the user has no avatar', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(fakeUser({ avatarUrl: null }));
    const result = await authService.removeAvatar('user-uuid-1');
    expect(result).toEqual({ avatarUrl: null });
    expect(mockCloud.deleteAsset).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

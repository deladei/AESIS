import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement:          { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    company:            { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn(), update: jest.fn() },
    user:               { findUnique: jest.fn(), create: jest.fn() },
    academicYear:       { findFirst: jest.fn() },
    department:         { findUnique: jest.fn() },
    auditLog:           { create: jest.fn() },
    logbookSubmission:  { createMany: jest.fn() },
    placementDocument:  { create: jest.fn(), findMany: jest.fn() },
  },
}));

jest.mock('../../../shared/utils/crypto', () => ({
  encryptPII: jest.fn((v: string) => `enc:${v}`),
  decryptPII: jest.fn((v: string) => v.replace('enc:', '')),
}));

jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:       'test',
    BCRYPT_ROUNDS:  4,
    ENCRYPTION_KEY: 'a'.repeat(64),
    FRONTEND_URL:   'http://localhost:5173',
  },
}));

import { prisma } from '../../../config/prisma';
import * as service from '../placements.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const fakeAcademicYear = {
  id: 'ay-1', label: '2024/2025',
  startDate: new Date('2024-09-01'), endDate: new Date('2025-08-31'),
  isActive: true, createdAt: new Date(),
};

const fakeDept      = { id: 'dept-1', name: 'Computer Science', code: 'CS', createdAt: new Date() };
const fakeCompany   = { id: 'co-1', name: 'TechBridge Ltd', address: 'enc:14 Marina', industry: null, website: null, createdAt: new Date(), updatedAt: new Date() };
const fakeCSupervisor = { id: 'csu-1', email: 'sup@techbridge.com', firstName: 'John', lastName: 'Doe', role: 'company_supervisor', isVerified: false, passwordHash: '', departmentId: 'dept-1', programmeId: null, verificationToken: null, passwordResetToken: null, passwordResetExpiry: null, createdAt: new Date(), updatedAt: new Date(), lastLoginAt: null, phone: null };

const futureStart = new Date(Date.now() + 86_400_000 * 30); // 30 days from now
const futureEnd   = new Date(Date.now() + 86_400_000 * 120);

const fakePlacement = {
  id: 'pl-1', studentId: 'student-1', academicSupervisorId: null,
  companySupervisorId: 'csu-1', companyId: 'co-1', academicYearId: 'ay-1',
  startDate: futureStart, endDate: futureEnd,
  placementStatus: 'pending', rejectionReason: null,
  approvedAt: null, approvedBy: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const validInput = {
  companyName:            'TechBridge Ltd',
  companyAddress:         '14 Marina St, Lagos',
  companySupervisorName:  'John Doe',
  companySupervisorEmail: 'sup@techbridge.com',
  startDate:              futureStart.toISOString(),
  endDate:                futureEnd.toISOString(),
};

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────
describe('service.createPlacement', () => {
  it('creates a placement for a student with no existing active/pending placement', async () => {
    (mp.placement.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.academicYear.findFirst as jest.Mock).mockResolvedValue(fakeAcademicYear);
    (mp.company.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.company.create as jest.Mock).mockResolvedValue(fakeCompany);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(fakeCSupervisor);
    (mp.placement.create as jest.Mock).mockResolvedValue({ ...fakePlacement, company: fakeCompany, companySupervisor: fakeCSupervisor });

    const result = await service.createPlacement('student-1', validInput);
    expect(result.placementStatus).toBe('pending');
    expect(mp.placement.create).toHaveBeenCalledTimes(1);
  });

  it('throws 409 if student has existing pending placement', async () => {
    (mp.placement.findFirst as jest.Mock).mockResolvedValue(fakePlacement);
    await expect(service.createPlacement('student-1', validInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 503 if no active academic year', async () => {
    (mp.placement.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.academicYear.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.createPlacement('student-1', validInput))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it('creates company supervisor account if email not found', async () => {
    (mp.placement.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.academicYear.findFirst as jest.Mock).mockResolvedValue(fakeAcademicYear);
    (mp.company.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.company.create as jest.Mock).mockResolvedValue(fakeCompany);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(null); // not found
    (mp.department.findUnique as jest.Mock).mockResolvedValue(fakeDept);
    (mp.user.create as jest.Mock).mockResolvedValue(fakeCSupervisor);
    (mp.placement.create as jest.Mock).mockResolvedValue({ ...fakePlacement, company: fakeCompany, companySupervisor: fakeCSupervisor });

    await service.createPlacement('student-1', validInput);
    expect(mp.user.create).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.getPlacement', () => {
  const fullPlacement = {
    ...fakePlacement,
    student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 'student@cs.edu' },
    academicSupervisor: null,
    companySupervisor: { id: 'csu-1', firstName: 'John', lastName: 'Doe', email: 'sup@techbridge.com' },
    company: fakeCompany,
    academicYear: { id: 'ay-1', label: '2024/2025' },
    documents: [],
  };

  it('returns placement for its student owner', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fullPlacement);
    const result = await service.getPlacement('pl-1', 'student-1', 'student');
    expect(result.id).toBe('pl-1');
  });

  it('throws 403 if student requests another student\'s placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fullPlacement);
    await expect(service.getPlacement('pl-1', 'other-student', 'student'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 for unknown placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getPlacement('bad-id', 'student-1', 'student'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('coordinator can access any placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fullPlacement);
    const result = await service.getPlacement('pl-1', 'coord-1', 'coordinator');
    expect(result.id).toBe('pl-1');
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.updatePlacementStatus', () => {
  it('throws 404 for unknown placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.updatePlacementStatus('bad-id', 'coord-1', { status: 'active' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 if already active', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, placementStatus: 'active' });
    await expect(service.updatePlacementStatus('pl-1', 'coord-1', { status: 'active' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('approves placement and generates logbook schedule', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placement.update as jest.Mock).mockResolvedValue({
      ...fakePlacement, placementStatus: 'active',
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    });
    (mp.logbookSubmission.createMany as jest.Mock).mockResolvedValue({ count: 24 });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updatePlacementStatus('pl-1', 'coord-1', { status: 'active' });
    expect(result.placementStatus).toBe('active');
    expect(mp.logbookSubmission.createMany).toHaveBeenCalledTimes(1);
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects placement and records reason in audit log', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placement.update as jest.Mock).mockResolvedValue({
      ...fakePlacement, placementStatus: 'rejected', rejectionReason: 'Not accredited',
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updatePlacementStatus('pl-1', 'coord-1', {
      status: 'rejected', rejectionReason: 'Not accredited',
    });
    expect(result.placementStatus).toBe('rejected');
    expect(mp.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'placement_status_change' }) })
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.createCompany', () => {
  it('creates a company when name is unique', async () => {
    (mp.company.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.company as any).create = jest.fn().mockResolvedValue(fakeCompany);
    await expect(service.createCompany({ name: 'TechBridge Ltd' })).resolves.toBeDefined();
  });

  it('throws 409 if company name already exists', async () => {
    (mp.company.findFirst as jest.Mock).mockResolvedValue(fakeCompany);
    await expect(service.createCompany({ name: 'TechBridge Ltd' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

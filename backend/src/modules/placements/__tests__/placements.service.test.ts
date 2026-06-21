import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement:          { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    company:            { findFirst: jest.fn(), findUnique: jest.fn(), upsert: jest.fn(), create: jest.fn(), update: jest.fn() },
    user:               { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
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
  companyAddress:         '14 Marina St, Accra',
  companySupervisorName:  'John Doe',
  companySupervisorEmail: 'sup@techbridge.com',
  region:                 'greater_accra' as const,
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
    (mp.user.findMany as jest.Mock).mockResolvedValue([]); // no regional supervisor → stays pending
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
    (mp.user.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.create as jest.Mock).mockResolvedValue({ ...fakePlacement, company: fakeCompany, companySupervisor: fakeCSupervisor });

    await service.createPlacement('student-1', validInput);
    expect(mp.user.create).toHaveBeenCalledTimes(1);
  });

  it('stays pending and never auto-activates, even when a regional supervisor exists', async () => {
    (mp.placement.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.academicYear.findFirst as jest.Mock).mockResolvedValue(fakeAcademicYear);
    (mp.company.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.company.create as jest.Mock).mockResolvedValue(fakeCompany);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(fakeCSupervisor);
    (mp.user.findMany as jest.Mock).mockResolvedValue([{ id: 'asu-1' }]); // a supervisor covers the region…
    (mp.placement.create as jest.Mock).mockResolvedValue({ ...fakePlacement, company: fakeCompany, companySupervisor: fakeCSupervisor });

    const result = await service.createPlacement('student-1', validInput);
    // …but registration must NOT auto-assign or activate — that waits for coordinator approval.
    expect(result.placementStatus).toBe('pending');
    expect(mp.placement.update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.pickLeastLoadedSupervisor', () => {
  it('returns null when no supervisor covers the region', async () => {
    (mp.user.findMany as jest.Mock).mockResolvedValue([]);
    expect(await service.pickLeastLoadedSupervisor('volta')).toBeNull();
  });

  it('returns the only supervisor without querying loads', async () => {
    (mp.user.findMany as jest.Mock).mockResolvedValue([{ id: 'asu-1' }]);
    expect(await service.pickLeastLoadedSupervisor('volta')).toBe('asu-1');
    expect(mp.placement.groupBy).not.toHaveBeenCalled();
  });

  it('picks the least-loaded among several supervisors', async () => {
    (mp.user.findMany as jest.Mock).mockResolvedValue([{ id: 'asu-1' }, { id: 'asu-2' }, { id: 'asu-3' }]);
    (mp.placement.groupBy as jest.Mock).mockResolvedValue([
      { academicSupervisorId: 'asu-1', _count: { _all: 5 } },
      { academicSupervisorId: 'asu-2', _count: { _all: 2 } },
      // asu-3 has no placements → load 0 → should win
    ]);
    expect(await service.pickLeastLoadedSupervisor('volta')).toBe('asu-3');
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

  it('approves placement with a clean slate — no logbook rows are pre-generated', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placement.update as jest.Mock).mockResolvedValue({
      ...fakePlacement, placementStatus: 'active',
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.updatePlacementStatus('pl-1', 'coord-1', { status: 'active' });
    expect(result.placementStatus).toBe('active');
    // Data must appear only when the student starts logging — nothing pre-seeded.
    expect(mp.logbookSubmission.createMany).not.toHaveBeenCalled();
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('auto-assigns the least-loaded regional supervisor on approval when none is given', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, region: 'greater_accra' });
    (mp.user.findMany as jest.Mock).mockResolvedValue([{ id: 'asu-1' }]); // sole regional supervisor
    (mp.placement.update as jest.Mock).mockResolvedValue({
      ...fakePlacement, placementStatus: 'active', academicSupervisorId: 'asu-1',
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    await service.updatePlacementStatus('pl-1', 'coord-1', { status: 'active' });
    expect(mp.placement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ academicSupervisorId: 'asu-1' }) }),
    );
  });

  it('honours an explicit supervisor over the regional auto-balance on approval', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, region: 'greater_accra' });
    (mp.placement.update as jest.Mock).mockResolvedValue({
      ...fakePlacement, placementStatus: 'active', academicSupervisorId: 'asu-9',
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    await service.updatePlacementStatus('pl-1', 'coord-1', { status: 'active', supervisorId: 'asu-9' });
    expect(mp.placement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ academicSupervisorId: 'asu-9' }) }),
    );
    expect(mp.user.findMany).not.toHaveBeenCalled(); // no region lookup needed
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

// ─────────────────────────────────────────────────────────────
describe('service.listPlacements', () => {
  it('filters by status when provided', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count as jest.Mock).mockResolvedValue(0);

    await service.listPlacements({ status: 'active' });

    expect(mp.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ placementStatus: 'active' }) }),
    );
  });

  it('filters by academicYearId when provided', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count as jest.Mock).mockResolvedValue(0);

    await service.listPlacements({ academicYearId: 'ay-1' });

    expect(mp.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ academicYearId: 'ay-1' }) }),
    );
  });

  it('applies no filters when neither status nor academicYearId provided', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count as jest.Mock).mockResolvedValue(0);

    await service.listPlacements({});

    expect(mp.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.getCompanyAnalytics', () => {
  const baseCompany = {
    id: 'co-1', name: 'TechBridge', industry: 'Technology',
    placements: [],
  };

  it('throws 404 if company not found', async () => {
    (mp.company.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getCompanyAnalytics('bad-id'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns null avgQualityScore when no submissions have scores', async () => {
    (mp.company.findUnique as jest.Mock).mockResolvedValue({
      ...baseCompany,
      placements: [{ logbookSubmissions: [{ analysis: null }], _count: { logbookSubmissions: 1 } }],
    });

    const result = await service.getCompanyAnalytics('co-1');
    expect(result.avgQualityScore).toBeNull();
  });

  it('calculates avgQualityScore when quality scores exist', async () => {
    (mp.company.findUnique as jest.Mock).mockResolvedValue({
      ...baseCompany,
      placements: [{
        logbookSubmissions: [
          { analysis: { qualityScore: 80 } },
          { analysis: { qualityScore: 60 } },
        ],
        _count: { logbookSubmissions: 2 },
      }],
    });

    const result = await service.getCompanyAnalytics('co-1');
    expect(result.avgQualityScore).toBe(70);
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.addPlacementDocument', () => {
  it('throws 404 if placement not found', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.addPlacementDocument('bad-id', 'stu-1', { url: 'u', name: 'n', size: 100, mimeType: 'application/pdf' }, 'placement_letter'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 if student is not the placement owner', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, studentId: 'other-student' });
    await expect(service.addPlacementDocument('pl-1', 'stu-1', { url: 'u', name: 'n', size: 100, mimeType: 'application/pdf' }, 'placement_letter'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates document for the placement owner', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placementDocument.create as jest.Mock).mockResolvedValue({ id: 'doc-1' });

    const result = await service.addPlacementDocument('pl-1', 'student-1', { url: 'u', name: 'report.pdf', size: 500, mimeType: 'application/pdf' }, 'final_report');
    expect(result).toHaveProperty('id', 'doc-1');
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.getPlacementDocuments', () => {
  it('throws 404 if placement not found', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getPlacementDocuments('bad-id', 'stu-1', 'student'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when student requests another student placement documents', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, studentId: 'owner' });
    await expect(service.getPlacementDocuments('pl-1', 'other-stu', 'student'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns documents for the placement owner', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placementDocument.findMany as jest.Mock).mockResolvedValue([{ id: 'doc-1' }]);

    const result = await service.getPlacementDocuments('pl-1', 'student-1', 'student');
    expect(result).toHaveLength(1);
  });

  it('allows coordinator to access any placement documents', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.placementDocument.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getPlacementDocuments('pl-1', 'coord-1', 'coordinator');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe('service.assignSupervisor', () => {
  const supervisorUser = {
    ...fakeCSupervisor, id: 'sup-9', email: 'theo@gmail.com', role: 'academic_supervisor',
  };

  it('assigns the supervisor and writes an audit log', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.user.findUnique as jest.Mock).mockResolvedValue(supervisorUser);
    (mp.placement.update as jest.Mock).mockResolvedValue({ ...fakePlacement, academicSupervisorId: 'sup-9' });

    const res = await service.assignSupervisor('pl-1', 'coord-1', { supervisorId: 'sup-9' });

    // pending placement → assigning the academic supervisor also activates it
    expect(mp.placement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pl-1' },
      data:  { academicSupervisorId: 'sup-9', placementStatus: 'active' },
    }));
    expect(mp.auditLog.create).toHaveBeenCalled();
    expect(res.academicSupervisorId).toBe('sup-9');
  });

  it('throws 404 when the placement does not exist', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.assignSupervisor('missing', 'coord-1', { supervisorId: 'sup-9' }))
      .rejects.toThrow(AppError);
    expect(mp.placement.update).not.toHaveBeenCalled();
  });

  it('throws 400 when the target user is not an academic supervisor', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ ...fakeCSupervisor, role: 'student' });
    await expect(service.assignSupervisor('pl-1', 'coord-1', { supervisorId: 'student-x' }))
      .rejects.toThrow(AppError);
    expect(mp.placement.update).not.toHaveBeenCalled();
  });

  it('assigns the company supervisor slot when kind=company', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fakePlacement, companySupervisorId: null });
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ ...fakeCSupervisor, id: 'csu-2', role: 'company_supervisor' });
    (mp.placement.update as jest.Mock).mockResolvedValue({ ...fakePlacement, companySupervisorId: 'csu-2' });

    const res = await service.assignSupervisor('pl-1', 'coord-1', { supervisorId: 'csu-2', kind: 'company' });

    expect(mp.placement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pl-1' },
      data:  { companySupervisorId: 'csu-2' },
    }));
    expect(mp.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action:   'placement_status_change',
        metadata: expect.objectContaining({ change: 'supervisor_assigned', kind: 'company', toSupervisorId: 'csu-2' }),
      }),
    }));
    expect(res.companySupervisorId).toBe('csu-2');
  });

  it('throws 400 when kind=company but the target user is an academic supervisor', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fakePlacement);
    (mp.user.findUnique as jest.Mock).mockResolvedValue({ ...fakeCSupervisor, role: 'academic_supervisor' });
    await expect(service.assignSupervisor('pl-1', 'coord-1', { supervisorId: 'asu-1', kind: 'company' }))
      .rejects.toThrow(AppError);
    expect(mp.placement.update).not.toHaveBeenCalled();
  });
});

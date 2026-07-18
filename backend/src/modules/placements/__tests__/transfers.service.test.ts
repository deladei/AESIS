import { Prisma } from '@prisma/client';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement:                { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
    placementTransferRequest: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    company:                  { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user:                     { findMany: jest.fn() },
    auditLog:                 { create: jest.fn() },
    $transaction:             jest.fn(),
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
import * as transfers from '../transfers.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const futureEnd = new Date(Date.now() + 86_400_000 * 60);

const fromPlacement = {
  id: 'pl-old', studentId: 'student-1', academicSupervisorId: 'asup-1',
  companySupervisorId: null, companyId: 'co-1', academicYearId: 'ay-1',
  region: 'ashanti', startDate: new Date(), endDate: futureEnd,
  placementStatus: 'active', isCurrent: true, supersedesPlacementId: null,
  rejectionReason: null, approvedAt: new Date(), approvedBy: 'coord-1',
  createdAt: new Date(), updatedAt: new Date(),
};

const openRequest = {
  id: 'tr-1', studentId: 'student-1', fromPlacementId: 'pl-old', toPlacementId: null,
  newCompanyName: 'Ashanti Fibre Ltd', newCompanyAddress: '12 Lake Road, Ho, Volta Region',
  reason: 'The unit I was attached to has closed down its operations',
  authorizationLetterUrl: null, status: 'requested',
  requestedAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null,
};

const requestInput = {
  newCompanyName:    'Ashanti Fibre Ltd',
  newCompanyAddress: '12 Lake Road, Ho, Volta Region',
  reason:            'The unit I was attached to has closed down its operations',
};

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('unique violation', {
    code: 'P2002', clientVersion: '5.22.0',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (mp.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof mp) => unknown) => fn(mp));
});

// ─────────────────────────────────────────────────────────────
describe('createTransferRequest', () => {
  it('404 when the placement does not exist', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(transfers.createTransferRequest('student-1', 'nope', requestInput))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it("403 on another student's placement", async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fromPlacement);
    await expect(transfers.createTransferRequest('student-2', 'pl-old', requestInput))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('409 when the placement is not active', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fromPlacement, placementStatus: 'pending' });
    await expect(transfers.createTransferRequest('student-1', 'pl-old', requestInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('409 when the placement is not current', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ ...fromPlacement, isCurrent: false });
    await expect(transfers.createTransferRequest('student-1', 'pl-old', requestInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('creates an open request on the current active placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fromPlacement);
    (mp.placementTransferRequest.create as jest.Mock).mockResolvedValue(openRequest);

    const result = await transfers.createTransferRequest('student-1', 'pl-old', requestInput);
    expect(result.status).toBe('requested');
    expect(mp.placementTransferRequest.create).toHaveBeenCalledTimes(1);
  });

  it('409 when an open request already exists (partial unique index)', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(fromPlacement);
    (mp.placementTransferRequest.create as jest.Mock).mockRejectedValue(p2002());
    await expect(transfers.createTransferRequest('student-1', 'pl-old', requestInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('decideTransferRequest', () => {
  it('404 when the request does not exist', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(transfers.decideTransferRequest('nope', 'coord-1', { decision: 'rejected', decisionNote: 'No authorization letter was provided' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('409 when the request was already decided', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({
      ...openRequest, status: 'approved', fromPlacement,
    });
    await expect(transfers.decideTransferRequest('tr-1', 'coord-1', { decision: 'rejected', decisionNote: 'Duplicate of an earlier request' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects with a note and writes an audit row', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({ ...openRequest, fromPlacement });
    (mp.placementTransferRequest.update as jest.Mock).mockResolvedValue({ ...openRequest, status: 'rejected' });

    const result = await transfers.decideTransferRequest('tr-1', 'coord-1', {
      decision: 'rejected', decisionNote: 'No authorization letter was provided',
    });
    expect(result.status).toBe('rejected');
    expect(mp.placementTransferRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'rejected', decidedById: 'coord-1' }) }),
    );
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mp.placement.update).not.toHaveBeenCalled();
  });

  it('409 on approval without an authorization letter — written permission is required in advance', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({ ...openRequest, fromPlacement });
    await expect(transfers.decideTransferRequest('tr-1', 'coord-1', { decision: 'approved' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('409 on approval when the from-placement is no longer active', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({
      ...openRequest,
      authorizationLetterUrl: 'https://files.example.com/letters/tr-1.pdf',
      fromPlacement: { ...fromPlacement, placementStatus: 'cancelled', isCurrent: false },
    });
    await expect(transfers.decideTransferRequest('tr-1', 'coord-1', { decision: 'approved' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('approves: closes the old placement, opens a current successor, links the chain', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({
      ...openRequest,
      authorizationLetterUrl: 'https://files.example.com/letters/tr-1.pdf',
      fromPlacement,
    });
    (mp.user.findMany as jest.Mock).mockResolvedValue([]); // no regional supervisor → carry the old one
    (mp.company.findFirst as jest.Mock).mockResolvedValue(null);
    (mp.company.create as jest.Mock).mockResolvedValue({ id: 'co-new', name: 'Ashanti Fibre Ltd' });
    (mp.placement.update as jest.Mock).mockResolvedValue({ ...fromPlacement, placementStatus: 'transferred_out', isCurrent: false });
    (mp.placement.create as jest.Mock).mockResolvedValue({ id: 'pl-new' });
    (mp.placementTransferRequest.update as jest.Mock).mockResolvedValue({
      ...openRequest, status: 'approved', toPlacementId: 'pl-new',
    });

    const result = await transfers.decideTransferRequest('tr-1', 'coord-1', { decision: 'approved' });
    expect(result.status).toBe('approved');

    expect(mp.placement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pl-old' },
      data:  { placementStatus: 'transferred_out', isCurrent: false },
    }));
    expect(mp.placement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        studentId:             'student-1',
        isCurrent:             true,
        placementStatus:       'active',
        supersedesPlacementId: 'pl-old',
        region:                'ashanti',            // carried from the old placement
        academicSupervisorId:  'asup-1',             // continuity fallback
        endDate:               futureEnd,            // attachment window unchanged
      }),
    }));
    expect(mp.placementTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'approved', toPlacementId: 'pl-new', decidedById: 'coord-1' }),
    }));
    expect(mp.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('approves with an explicit new region and supervisor', async () => {
    (mp.placementTransferRequest.findUnique as jest.Mock).mockResolvedValue({
      ...openRequest, fromPlacement,
    });
    (mp.company.findFirst as jest.Mock).mockResolvedValue({ id: 'co-new', name: 'Ashanti Fibre Ltd' });
    (mp.company.update as jest.Mock).mockResolvedValue({ id: 'co-new', name: 'Ashanti Fibre Ltd' });
    (mp.placement.update as jest.Mock).mockResolvedValue({});
    (mp.placement.create as jest.Mock).mockResolvedValue({ id: 'pl-new' });
    (mp.placementTransferRequest.update as jest.Mock).mockResolvedValue({ ...openRequest, status: 'approved' });

    await transfers.decideTransferRequest('tr-1', 'coord-1', {
      decision:               'approved',
      authorizationLetterUrl: 'https://files.example.com/letters/tr-1.pdf',
      newRegion:              'volta',
      supervisorId:           'asup-2',
    });

    expect(mp.placement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ region: 'volta', academicSupervisorId: 'asup-2' }),
    }));
    // Explicit supervisor: no load-balancing lookup needed
    expect(mp.user.findMany).not.toHaveBeenCalled();
  });
});

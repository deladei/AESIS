jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findUnique: jest.fn() },
    industrySupervisor: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    webmailDomain: { findUnique: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import {
  classifyEmailDomain,
  createSupervisor,
  updateSupervisor,
  verifySupervisor,
  visitConfirmSupervisor,
} from '../industry.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const placement = {
  id: 'p1',
  studentId: 's1',
  academicSupervisorId: 'as1',
  companySupervisorId: null,
};

const student = { id: 's1', role: 'student' as const };
const otherStudent = { id: 's2', role: 'student' as const };
const coordinator = { id: 'c1', role: 'coordinator' as const };
const supervisor = { id: 'as1', role: 'academic_supervisor' as const };
const otherSupervisor = { id: 'as2', role: 'academic_supervisor' as const };

beforeEach(() => jest.clearAllMocks());

describe('classifyEmailDomain', () => {
  it('none when no email', async () => {
    expect(await classifyEmailDomain(null)).toBe('none');
    expect(await classifyEmailDomain('')).toBe('none');
  });

  it('webmail when the domain is in the lookup', async () => {
    (mp.webmailDomain.findUnique as jest.Mock).mockResolvedValue({ domain: 'gmail.com' });
    expect(await classifyEmailDomain('kwame.mensah@gmail.com')).toBe('webmail');
    expect(mp.webmailDomain.findUnique).toHaveBeenCalledWith({ where: { domain: 'gmail.com' } });
  });

  it('company when the domain is not in the lookup — a flag, never a block', async () => {
    (mp.webmailDomain.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await classifyEmailDomain('adjoa@ecobank.com.gh')).toBe('company');
  });
});

describe('createSupervisor', () => {
  beforeEach(() => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(placement);
    (mp.webmailDomain.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.industrySupervisor.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'is1', ...data }));
  });

  it('student adds a record on their own placement; it starts unverified', async () => {
    await createSupervisor(student, 'p1', { name: 'Yaw Boateng', email: 'yaw@goldfields.com.gh' });
    const data = (mp.industrySupervisor.create as jest.Mock).mock.calls[0][0].data;
    expect(data.emailDomainType).toBe('company');
    expect(data.verificationStatus).toBeUndefined(); // DB default: unverified
  });

  it("student cannot add to someone else's placement", async () => {
    await expect(createSupervisor(otherStudent, 'p1', { name: 'Yaw Boateng' })).rejects.toThrow('Not permitted');
  });

  it('a verification status smuggled into the input never reaches the write', async () => {
    await createSupervisor(
      student,
      'p1',
      { name: 'Yaw Boateng', verificationStatus: 'visit_confirmed' } as never,
    );
    const data = (mp.industrySupervisor.create as jest.Mock).mock.calls[0][0].data;
    expect(data.verificationStatus).toBeUndefined();
  });
});

describe('updateSupervisor', () => {
  const record = {
    id: 'is1',
    placementId: 'p1',
    name: 'Yaw Boateng',
    phone: '0244000000',
    email: 'yaw@goldfields.com.gh',
    verificationStatus: 'unverified',
    placement,
  };

  beforeEach(() => {
    (mp.webmailDomain.findUnique as jest.Mock).mockResolvedValue(null);
    (mp.industrySupervisor.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...record, ...data }));
  });

  it('student edits their own unverified record', async () => {
    (mp.industrySupervisor.findUnique as jest.Mock).mockResolvedValue(record);
    await updateSupervisor(student, 'is1', { designation: 'IT Manager' });
    expect(mp.industrySupervisor.update).toHaveBeenCalled();
  });

  it('student is blocked once the record is verified (409)', async () => {
    (mp.industrySupervisor.findUnique as jest.Mock).mockResolvedValue({
      ...record,
      verificationStatus: 'coordinator_approved',
    });
    await expect(updateSupervisor(student, 'is1', { email: 'me@gmail.com' })).rejects.toThrow('verified');
  });

  it('a staff identity edit on a verified record resets verification to unverified', async () => {
    (mp.industrySupervisor.findUnique as jest.Mock).mockResolvedValue({
      ...record,
      verificationStatus: 'coordinator_approved',
    });
    await updateSupervisor(coordinator, 'is1', { email: 'different@gmail.com' });
    const data = (mp.industrySupervisor.update as jest.Mock).mock.calls[0][0].data;
    expect(data.verificationStatus).toBe('unverified');
    expect(data.verifiedById).toBeNull();
  });
});

describe('verification', () => {
  const record = { id: 'is1', placementId: 'p1', verificationStatus: 'unverified', placement };

  beforeEach(() => {
    (mp.industrySupervisor.findUnique as jest.Mock).mockResolvedValue(record);
    (mp.industrySupervisor.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...record, ...data }));
  });

  it('student cannot set any verification status (18f)', async () => {
    await expect(verifySupervisor(student, 'is1', { status: 'coordinator_approved' })).rejects.toThrow(
      'Only the coordinator',
    );
    await expect(visitConfirmSupervisor(student as never, 'is1', {})).rejects.toThrow(
      'assigned academic supervisor',
    );
  });

  it('coordinator approves with an audit identity', async () => {
    await verifySupervisor(coordinator, 'is1', { status: 'coordinator_approved', note: 'letterhead checked' });
    const data = (mp.industrySupervisor.update as jest.Mock).mock.calls[0][0].data;
    expect(data.verificationStatus).toBe('coordinator_approved');
    expect(data.verifiedById).toBe('c1');
  });

  it('assigned academic supervisor visit-confirms; an unassigned one cannot', async () => {
    await visitConfirmSupervisor(supervisor, 'is1', { note: 'met in person at site' });
    const data = (mp.industrySupervisor.update as jest.Mock).mock.calls[0][0].data;
    expect(data.verificationStatus).toBe('visit_confirmed');

    await expect(visitConfirmSupervisor(otherSupervisor, 'is1', {})).rejects.toThrow(
      'assigned academic supervisor',
    );
  });
});

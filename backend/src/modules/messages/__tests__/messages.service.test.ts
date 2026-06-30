import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findUnique: jest.fn() },
    message:   { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('../../notifications/notifications.service', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../../shared/utils/socketEmitter', () => ({
  emitToUser: jest.fn(),
}));
jest.mock('../../../shared/utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../../config/prisma';
import { createNotification } from '../../notifications/notifications.service';
import { emitToUser } from '../../../shared/utils/socketEmitter';
import { sendEmail } from '../../../shared/utils/email';
import { listThread, postMessage } from '../messages.service';

const mp = prisma as unknown as {
  placement: { findUnique: jest.Mock };
  message: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
};

const placement = {
  id: 'plc-1',
  studentId: 'stu-1',
  academicSupervisorId: 'sup-1',
  student: { id: 'stu-1', firstName: 'Ama', lastName: 'Mensah', email: 'ama@cs.edu' },
};

const ADMIN = { id: 'adm-1', role: 'admin' };
const STUDENT = { id: 'stu-1', role: 'student' };
const OUTSIDER = { id: 'stu-9', role: 'student' };
const COORDINATOR = { id: 'crd-1', role: 'coordinator' };

beforeEach(() => {
  jest.clearAllMocks();
  mp.placement.findUnique.mockResolvedValue(placement);
  mp.message.findMany.mockResolvedValue([]);
  mp.message.create.mockResolvedValue({
    id: 'msg-1', body: 'hello', createdAt: new Date(), senderId: 'adm-1',
    sender: { firstName: 'Admin', lastName: 'User', role: 'admin' },
  });
  mp.message.updateMany.mockResolvedValue({ count: 0 });
});

describe('listThread', () => {
  it('rejects a non-participant with 403', async () => {
    await expect(listThread(OUTSIDER, 'plc-1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lets the student read and marks incoming messages read', async () => {
    mp.message.findMany.mockResolvedValue([
      { id: 'm1', body: 'hi', createdAt: new Date(), readAt: null, senderId: 'adm-1',
        sender: { firstName: 'Admin', lastName: 'User', role: 'admin' } },
      { id: 'm2', body: 'reply', createdAt: new Date(), readAt: null, senderId: 'stu-1',
        sender: { firstName: 'Ama', lastName: 'Mensah', role: 'student' } },
    ]);

    const out = await listThread(STUDENT, 'plc-1');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ mine: false, senderRole: 'admin' });
    expect(out[1]).toMatchObject({ mine: true });
    // Only the admin's message (incoming to the student) is marked read.
    expect(mp.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['m1'] } } }),
    );
  });

  it('throws 404 when the placement does not exist', async () => {
    mp.placement.findUnique.mockResolvedValue(null);
    await expect(listThread(ADMIN, 'plc-x')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('postMessage', () => {
  it('rejects an empty body before any DB write', async () => {
    await expect(postMessage(ADMIN, 'plc-1', '   ')).rejects.toBeInstanceOf(AppError);
    expect(mp.message.create).not.toHaveBeenCalled();
  });

  it('forbids a coordinator (read-only oversight) from posting', async () => {
    await expect(postMessage(COORDINATOR, 'plc-1', 'hi')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('admin → student: notifies + emails the student, not the admin', async () => {
    await postMessage(ADMIN, 'plc-1', 'Welcome aboard');

    const notified = (createNotification as jest.Mock).mock.calls.map(c => c[0].userId);
    expect(notified).toEqual(expect.arrayContaining(['stu-1', 'sup-1']));
    expect(notified).not.toContain('adm-1');
    expect(emitToUser).toHaveBeenCalledWith('stu-1', 'notification:new', expect.objectContaining({ kind: 'message' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ama@cs.edu' }));
  });

  it('student reply reaches the admin who already posted (no email back to the student)', async () => {
    // An admin previously posted in this thread.
    mp.message.findMany.mockResolvedValue([{ senderId: 'adm-1' }]);
    mp.message.create.mockResolvedValue({
      id: 'msg-2', body: 'thanks', createdAt: new Date(), senderId: 'stu-1',
      sender: { firstName: 'Ama', lastName: 'Mensah', role: 'student' },
    });

    await postMessage(STUDENT, 'plc-1', 'thanks!');

    const notified = (createNotification as jest.Mock).mock.calls.map(c => c[0].userId);
    expect(notified).toEqual(expect.arrayContaining(['adm-1', 'sup-1']));
    expect(notified).not.toContain('stu-1');
    // The student is the sender, so no email goes back to them.
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    logbookSubmission: { findMany: jest.fn() },
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../shared/utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../shared/utils/socketEmitter', () => ({
  emitToUser: jest.fn(),
}));

jest.mock('../../modules/notifications/notifications.service', () => ({
  createNotification: jest.fn().mockResolvedValue({
    id: 'notif-1', type: 'submission_reminder', title: 'Due soon',
    body: 'Submit now', link: '/logbook/week/1', createdAt: new Date(),
  }),
}));

import cron from 'node-cron';
import { startDeadlineReminderJobs } from '../deadlineReminder';
import { prisma } from '../../config/prisma';
import { sendEmail } from '../../shared/utils/email';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { createNotification } from '../../modules/notifications/notifications.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

afterEach(() => jest.clearAllMocks());

describe('startDeadlineReminderJobs', () => {
  it('schedules two cron jobs', () => {
    startDeadlineReminderJobs();
    expect(cron.schedule).toHaveBeenCalledTimes(2);
    // Wed 09:00
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 9 * * 3',
      expect.any(Function),
      expect.objectContaining({ timezone: 'Africa/Lagos' }),
    );
    // Thu 09:00
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 9 * * 4',
      expect.any(Function),
      expect.objectContaining({ timezone: 'Africa/Lagos' }),
    );
  });

  it('executes the callback and sends notifications when submissions need reminding', async () => {
    (mockPrisma.logbookSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        weekNumber: 3,
        studentId:  'stu-1',
        student:    { email: 'stu@cs.edu', firstName: 'Ada' },
      },
    ]);

    startDeadlineReminderJobs();

    // Capture and invoke the first scheduled callback (48h Wed job)
    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
    await callback();

    expect(mockPrisma.logbookSubmission.findMany).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'stu-1' }));
    expect(emitToUser).toHaveBeenCalledWith('stu-1', 'notification:new', expect.any(Object));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'stu@cs.edu' }));
  });

  it('logs error and does not throw when DB query fails', async () => {
    (mockPrisma.logbookSubmission.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    const { logger } = jest.requireMock('../../config/logger');

    startDeadlineReminderJobs();
    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('sends urgent wording for the 24h job (Thursday)', async () => {
    (mockPrisma.logbookSubmission.findMany as jest.Mock).mockResolvedValue([
      {
        weekNumber: 5,
        studentId:  'stu-2',
        student:    { email: 'stu2@cs.edu', firstName: 'Ola' },
      },
    ]);

    startDeadlineReminderJobs();
    // Second scheduled callback = Thu 09:00 = 24h
    const callback24h = (cron.schedule as jest.Mock).mock.calls[1][1] as () => Promise<void>;
    await callback24h();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('URGENT') }),
    );
  });
});

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user:                { findMany: jest.fn() },
    placement:           { count: jest.fn() },
    logbookSubmission:   { count: jest.fn() },
    studentRiskScore:    { count: jest.fn() },
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../shared/utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import cron from 'node-cron';
import { startWeeklyReportJob } from '../weeklyReport';
import { prisma } from '../../config/prisma';
import { sendEmail } from '../../shared/utils/email';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

afterEach(() => jest.clearAllMocks());

async function invokeJob() {
  startWeeklyReportJob();
  const cb = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
  await cb();
}

describe('startWeeklyReportJob', () => {
  it('schedules the cron job on Monday 08:00', () => {
    startWeeklyReportJob();
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 8 * * 1',
      expect.any(Function),
      expect.objectContaining({ timezone: 'Africa/Lagos' }),
    );
  });

  it('sends an email to each coordinator with stats', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'coord-1', email: 'coord@cs.edu', firstName: 'Dr. Ike' },
    ]);
    (mockPrisma.placement.count as jest.Mock).mockResolvedValue(20);
    (mockPrisma.logbookSubmission.count as jest.Mock)
      .mockResolvedValueOnce(15)   // submittedLastWeek
      .mockResolvedValueOnce(20);  // totalScheduledLastWeek
    (mockPrisma.studentRiskScore.count as jest.Mock).mockResolvedValue(2);

    await invokeJob();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:      'coord@cs.edu',
        subject: expect.stringContaining('Weekly Report'),
      }),
    );
  });

  it('skips email when no coordinators exist', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([]);

    await invokeJob();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('uses 100% compliance rate when no submissions were scheduled last week', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'coord-2', email: 'c@cs.edu', firstName: 'Dr. X' },
    ]);
    (mockPrisma.placement.count as jest.Mock).mockResolvedValue(5);
    (mockPrisma.logbookSubmission.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.studentRiskScore.count as jest.Mock).mockResolvedValue(0);

    await invokeJob();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('100%') }),
    );
  });

  it('logs an error and does not throw when DB call fails', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));
    const { logger } = jest.requireMock('../../config/logger');

    await expect(invokeJob()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

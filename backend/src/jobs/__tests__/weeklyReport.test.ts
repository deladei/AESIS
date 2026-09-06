jest.mock('node-cron', () => ({ schedule: jest.fn() }));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user:                { findMany: jest.fn() },
    placement:           { count: jest.fn() },
    logbookEntry:        { count: jest.fn() },
  },
}));

jest.mock('../../modules/risk/risk.service', () => ({
  refreshRiskSnapshots:   jest.fn().mockResolvedValue(undefined),
  latestRiskDistribution: jest.fn(),
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
import { refreshRiskSnapshots, latestRiskDistribution } from '../../modules/risk/risk.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockDistribution = latestRiskDistribution as jest.Mock;

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
      expect.objectContaining({ timezone: 'Africa/Accra' }),
    );
  });

  it('sends an email to each coordinator with stats', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'coord-1', email: 'coord@cs.edu', firstName: 'Dr. Ike' },
    ]);
    (mockPrisma.placement.count as jest.Mock).mockResolvedValue(20);
    (mockPrisma.logbookEntry.count as jest.Mock)
      .mockResolvedValueOnce(15)   // weeks handed in last week
      .mockResolvedValueOnce(20);  // weeks that closed last week
    mockDistribution.mockResolvedValue({ low: 10, medium: 8, high: 2 });

    await invokeJob();

    expect(refreshRiskSnapshots).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:      'coord@cs.edu',
        subject: expect.stringContaining('Weekly Report'),
      }),
    );
    // High count comes from the latest-tier distribution, not raw history rows.
    expect((sendEmail as jest.Mock).mock.calls[0][0].html).toContain('2');
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
    (mockPrisma.logbookEntry.count as jest.Mock).mockResolvedValue(0);
    mockDistribution.mockResolvedValue({ low: 0, medium: 0, high: 0 });

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

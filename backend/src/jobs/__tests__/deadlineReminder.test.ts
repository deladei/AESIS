jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    logbookEntry: { findMany: jest.fn() },
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() },
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
    body: 'Submit now', link: '/student/logbook?week=1', createdAt: new Date(),
  }),
}));

import cron from 'node-cron';
import { runDeadlineReminder, startDeadlineReminderJobs } from '../deadlineReminder';
import { prisma } from '../../config/prisma';
import { sendEmail } from '../../shared/utils/email';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { createNotification } from '../../modules/notifications/notifications.service';

const mockPrisma = prisma as unknown as { logbookEntry: { findMany: jest.Mock } };

const TODAY = new Date('2026-09-07T00:00:00.000Z');
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

function week(overrides: Record<string, unknown> = {}) {
  return {
    weekNumber: 3,
    periodEnd:  utc('2026-09-09'),   // two days out
    studentId:  'stu-1',
    student:    { email: 'kwame@cs.edu', firstName: 'Kwame' },
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

describe('startDeadlineReminderJobs', () => {
  it('schedules one daily job on Ghana time', () => {
    startDeadlineReminderJobs();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith(
      '0 9 * * *',
      expect.any(Function),
      expect.objectContaining({ timezone: 'Africa/Accra' }),
    );
  });

  it('logs and does not throw when the query fails', async () => {
    mockPrisma.logbookEntry.findMany.mockRejectedValue(new Error('DB error'));
    const { logger } = jest.requireMock('../../config/logger');

    startDeadlineReminderJobs();
    const callback = (cron.schedule as jest.Mock).mock.calls[0][1] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('runDeadlineReminder', () => {
  it('reads the live logbook_entry table, not the retired submissions table', async () => {
    mockPrisma.logbookEntry.findMany.mockResolvedValue([]);
    await runDeadlineReminder(TODAY);

    const where = mockPrisma.logbookEntry.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['draft', 'returned'] });
    expect(where.placement).toEqual({ is: { placementStatus: 'active' } });
    // Both reminder windows, keyed off each week's own end date.
    expect(where.periodEnd).toEqual({ in: [utc('2026-09-08'), utc('2026-09-09')] });
  });

  it('notifies, emits and emails a student two days out', async () => {
    mockPrisma.logbookEntry.findMany.mockResolvedValue([week()]);

    const { reminded } = await runDeadlineReminder(TODAY);

    expect(reminded).toBe(1);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'stu-1',
      type:   'submission_reminder',
      link:   '/student/logbook?week=3',
      metadata: { weekNumber: 3, hoursUntilDeadline: 48 },
    }));
    expect(emitToUser).toHaveBeenCalledWith('stu-1', 'notification:new', expect.any(Object));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to:      'kwame@cs.edu',
      subject: expect.stringContaining('48h'),
    }));
  });

  it('escalates the wording at 24 hours', async () => {
    mockPrisma.logbookEntry.findMany.mockResolvedValue([
      week({ weekNumber: 5, periodEnd: utc('2026-09-08'), studentId: 'stu-2' }),
    ]);

    await runDeadlineReminder(TODAY);

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('Urgent'),
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { weekNumber: 5, hoursUntilDeadline: 24 },
    }));
  });

  it('keeps going when one student\'s email fails', async () => {
    mockPrisma.logbookEntry.findMany.mockResolvedValue([
      week({ studentId: 'stu-1' }),
      week({ studentId: 'stu-2', student: { email: 'ama@cs.edu', firstName: 'Ama' } }),
    ]);
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));

    const { reminded } = await runDeadlineReminder(TODAY);

    expect(reminded).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

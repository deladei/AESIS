jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:      jest.fn(),
      findMany:   jest.fn(),
      findUnique: jest.fn(),
    },
    logbookEntry: {
      count:    jest.fn(),
      findMany: jest.fn(),
      groupBy:  jest.fn(),
    },
    supervisorFeedback: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../notifications/notifications.service', () => ({ createNotification: jest.fn() }));
jest.mock('../../../shared/utils/email', () => ({ sendEmail: jest.fn() }));

import { prisma } from '../../../config/prisma';
import { getAdminDashboard, messageIntern, scheduleCallWithIntern } from '../admin.service';
import { createNotification } from '../../notifications/notifications.service';
import { sendEmail } from '../../../shared/utils/email';

const mp = prisma as jest.Mocked<typeof prisma>;
const mockNotify = createNotification as jest.Mock;
const mockEmail = sendEmail as jest.Mock;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:      'p-1',
  student: {
    firstName: 'Akua',
    lastName:  'Sarpong',
    programme: { name: 'B.Sc. Computer Science' },
  },
  riskScores: [{ riskTier: 'low' }],
  ...overrides,
});

const makeRecent = (overrides: Record<string, unknown> = {}) => ({
  id:          's-1',
  weekNumber:  4,
  submittedAt: new Date('2026-05-30T10:00:00Z'),
  status:      'submitted',
  placement:   { student: { firstName: 'Kojo', lastName: 'Mensah' } },
  ...overrides,
});

/** Queue the three `logbookEntry.count` calls in Promise.all order. */
function queueCounts(totalSubmitted: number, pending: number, reviewed: number) {
  (mp.logbookEntry.count as jest.Mock)
    .mockResolvedValueOnce(totalSubmitted)
    .mockResolvedValueOnce(pending)
    .mockResolvedValueOnce(reviewed);
}

describe('getAdminDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds overview counts and avgEngagement = submitted / (interns × 6)', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(12); // 12 interns → 72 scheduled
    queueCounts(54, 8, 24);                                          // 54/72 = 75%
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.overview.activeInterns).toBe(12);
    expect(result.overview.pendingReviews).toBe(8);
    expect(result.overview.avgEngagement).toBe(75); // round(54/(12*6)*100)
    expect(result.submissionCounts).toEqual({ pending: 8, reviewed: 24 });
  });

  it('defaults avgEngagement to 100 when no interns are active', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(0);
    queueCounts(0, 0, 0);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.overview.avgEngagement).toBe(100);
  });

  it('ranks the pulse board by engagement desc and attaches feedback counts', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(2);
    queueCounts(9, 1, 3);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-low' }),                                       // 3/6 = 50%
      makePlacement({
        id: 'p-high',
        student: { firstName: 'Adwoa', lastName: 'Agyeman', programme: { name: 'B.Sc. IT' } },
        riskScores: [{ riskTier: 'medium' }],
      }),                                                                    // 6/6 = 100%
    ]);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-low',  _count: { _all: 3 } },
      { placementId: 'p-high', _count: { _all: 6 } },
    ]);
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([
      { submission: { placementId: 'p-high' } },
      { submission: { placementId: 'p-high' } },
      { submission: { placementId: 'p-low' } },
    ]);
    (mp.logbookEntry.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.pulseBoard.map(p => p.placementId)).toEqual(['p-high', 'p-low']);
    expect(result.pulseBoard[0]).toMatchObject({
      engagementPct: 100,
      submittedWeeks: 6,
      totalWeeks: 6,
      feedbackCount: 2,
      department: 'B.Sc. IT',
      riskTier: 'medium',
    });
    expect(result.pulseBoard[1]).toMatchObject({ engagementPct: 50, feedbackCount: 1 });
  });

  it('maps recent submitted entries to the view shape', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(1);
    queueCounts(4, 1, 1);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([makeRecent()]);

    const result = await getAdminDashboard();

    expect(result.recentSubmissions).toEqual([
      {
        id:          's-1',
        internName:  'Kojo Mensah',
        weekNumber:  4,
        submittedAt: new Date('2026-05-30T10:00:00Z'),
        status:      'submitted',
      },
    ]);
  });

  it('returns an empty shape with no active placements (skips groupBy + feedback queries)', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(0);
    queueCounts(0, 0, 0);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.pulseBoard).toHaveLength(0);
    expect(result.recentSubmissions).toHaveLength(0);
    expect(mp.logbookEntry.groupBy).not.toHaveBeenCalled();
    expect(mp.supervisorFeedback.findMany).not.toHaveBeenCalled();
  });
});

describe('admin messaging', () => {
  const placementWithStudent = {
    studentId: 'stu-1',
    student: { firstName: 'Ama', lastName: 'Mensah', email: 'ama@uni.edu.gh' },
  };

  beforeEach(() => { mockNotify.mockReset(); mockEmail.mockReset(); (mp.placement.findUnique as jest.Mock).mockReset(); });

  it('messageIntern notifies in-app AND emails the registered address', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(placementWithStudent);
    const res = await messageIntern('p-1', 'Please submit week 3.');
    expect(res).toMatchObject({ ok: true, emailedTo: 'ama@uni.edu.gh' });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'stu-1', type: 'system' }));
    expect(mockEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ama@uni.edu.gh' }));
  });

  it('scheduleCallWithIntern emails the Meet link + notifies, linking to the room', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(placementWithStudent);
    const res = await scheduleCallWithIntern('p-1', {
      scheduledAt: '2026-07-01T10:00:00.000Z', topic: 'Mid-term', meetLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(res.ok).toBe(true);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://meet.google.com/abc-defg-hij' }));
    expect(mockEmail.mock.calls[0][0].html).toContain('https://meet.google.com/abc-defg-hij');
  });

  it('404s on an unknown placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(messageIntern('nope', 'hi')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockEmail).not.toHaveBeenCalled();
  });
});

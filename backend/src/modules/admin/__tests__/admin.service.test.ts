jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:    jest.fn(),
      findMany: jest.fn(),
    },
    logbookSubmission: {
      count:    jest.fn(),
      findMany: jest.fn(),
      groupBy:  jest.fn(),
    },
    supervisorFeedback: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import { getAdminDashboard } from '../admin.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:      'p-1',
  student: {
    firstName: 'Akua',
    lastName:  'Sarpong',
    programme: { name: 'B.Sc. Computer Science' },
  },
  riskScores: [{ riskTier: 'low' }],
  _count:     { logbookSubmissions: 6 },
  ...overrides,
});

const makeRecent = (overrides: Record<string, unknown> = {}) => ({
  id:               's-1',
  weekNumber:       4,
  submittedAt:      new Date('2026-05-30T10:00:00Z'),
  submissionStatus: 'submitted',
  student:          { firstName: 'Kojo', lastName: 'Mensah' },
  ...overrides,
});

/** Queue the four `logbookSubmission.count` calls in Promise.all order. */
function queueCounts(totalScheduled: number, totalSubmitted: number, pending: number, reviewed: number) {
  (mp.logbookSubmission.count as jest.Mock)
    .mockResolvedValueOnce(totalScheduled)
    .mockResolvedValueOnce(totalSubmitted)
    .mockResolvedValueOnce(pending)
    .mockResolvedValueOnce(reviewed);
}

describe('getAdminDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds overview counts and avgEngagement = submitted/scheduled', async () => {
    (mp.placement.count          as jest.Mock).mockResolvedValue(12);
    queueCounts(60, 45, 8, 24);
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.overview.activeInterns).toBe(12);
    expect(result.overview.pendingReviews).toBe(8);
    expect(result.overview.avgEngagement).toBe(75); // round(45/60*100)
    expect(result.submissionCounts).toEqual({ pending: 8, reviewed: 24 });
  });

  it('defaults avgEngagement to 100 when nothing is scheduled', async () => {
    (mp.placement.count          as jest.Mock).mockResolvedValue(0);
    queueCounts(0, 0, 0, 0);
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.overview.avgEngagement).toBe(100);
  });

  it('ranks the pulse board by engagement desc and attaches feedback counts', async () => {
    (mp.placement.count          as jest.Mock).mockResolvedValue(2);
    queueCounts(12, 9, 1, 3);
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-low',  _count: { logbookSubmissions: 6 } }),  // 3/6 = 50%
      makePlacement({ id: 'p-high', _count: { logbookSubmissions: 6 }, student: { firstName: 'Adwoa', lastName: 'Agyeman', programme: { name: 'B.Sc. IT' } }, riskScores: [{ riskTier: 'medium' }] }), // 6/6 = 100%
    ]);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-low',  _count: { _all: 3 } },
      { placementId: 'p-high', _count: { _all: 6 } },
    ]);
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([
      { submission: { placementId: 'p-high' } },
      { submission: { placementId: 'p-high' } },
      { submission: { placementId: 'p-low' } },
    ]);
    (mp.logbookSubmission.findMany as jest.Mock).mockResolvedValue([]);

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

  it('maps recent submissions to the view shape', async () => {
    (mp.placement.count          as jest.Mock).mockResolvedValue(1);
    queueCounts(6, 4, 1, 1);
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.findMany as jest.Mock).mockResolvedValue([makeRecent()]);

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
    (mp.placement.count          as jest.Mock).mockResolvedValue(0);
    queueCounts(0, 0, 0, 0);
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.pulseBoard).toHaveLength(0);
    expect(result.recentSubmissions).toHaveLength(0);
    expect(mp.logbookSubmission.groupBy).not.toHaveBeenCalled();
    expect(mp.supervisorFeedback.findMany).not.toHaveBeenCalled();
  });
});

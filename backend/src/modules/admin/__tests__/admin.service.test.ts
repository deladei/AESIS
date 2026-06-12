jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:    jest.fn(),
      findMany: jest.fn(),
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

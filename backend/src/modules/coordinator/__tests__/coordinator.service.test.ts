jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:    jest.fn(),
      findMany: jest.fn(),
    },
    studentRiskScore: {
      groupBy: jest.fn(),
    },
    logbookSubmission: {
      groupBy: jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import { getCoordinatorDashboard, listStudents } from '../coordinator.service';

const mp = prisma as jest.Mocked<typeof prisma>;

// ── getCoordinatorDashboard ───────────────────────────────────

describe('getCoordinatorDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns correct overview when all data is present', async () => {
    (mp.placement.count as jest.Mock)
      .mockResolvedValueOnce(40)   // active
      .mockResolvedValueOnce(5);   // pending

    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([
      { riskTier: 'low',    _count: { _all: 25 } },
      { riskTier: 'medium', _count: { _all: 10 } },
      { riskTier: 'high',   _count: { _all: 5  } },
    ]);

    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { weekNumber: 1, _count: { _all: 40 } },
        { weekNumber: 2, _count: { _all: 40 } },
      ])
      .mockResolvedValueOnce([
        { weekNumber: 1, _count: { _all: 36 } },
        { weekNumber: 2, _count: { _all: 32 } },
      ]);

    const result = await getCoordinatorDashboard();

    expect(result.overview.activePlacements).toBe(40);
    expect(result.overview.pendingApprovals).toBe(5);
    expect(result.overview.highRiskCount).toBe(5);
    // (36 + 32) / (40 + 40) = 68 / 80 = 85%
    expect(result.overview.complianceRate).toBe(85);
  });

  it('returns complianceRate 100 when no submissions are scheduled', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([])   // scheduled
      .mockResolvedValueOnce([]);  // submitted

    const result = await getCoordinatorDashboard();

    expect(result.overview.complianceRate).toBe(100);
  });

  it('builds riskDistribution with zero counts for missing tiers', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([
      { riskTier: 'high', _count: { _all: 3 } },
    ]);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([]);

    const result = await getCoordinatorDashboard();

    expect(result.riskDistribution).toEqual({ low: 0, medium: 0, high: 3 });
  });

  it('builds submissionTrends with correct scheduled/submitted per week', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(10);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { weekNumber: 1, _count: { _all: 10 } },
        { weekNumber: 2, _count: { _all: 10 } },
      ])
      .mockResolvedValueOnce([
        { weekNumber: 1, _count: { _all: 8 } },
        // week 2 has no submitted entries
      ]);

    const result = await getCoordinatorDashboard();

    expect(result.submissionTrends).toEqual([
      { week: 1, scheduled: 10, submitted: 8 },
      { week: 2, scheduled: 10, submitted: 0 },
    ]);
  });
});

// ── listStudents ──────────────────────────────────────────────

describe('listStudents', () => {
  beforeEach(() => jest.clearAllMocks());

  const fakePlacement = {
    id:      'p-1',
    student: { id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@uni.edu' },
    riskScores: [{ riskTier: 'medium', riskScore: { toNumber: () => 0.55 }, computedAt: new Date() }],
    logbookSubmissions: [{
      weekNumber:       3,
      submissionStatus: 'submitted',
      submittedAt:      new Date('2026-01-20'),
    }],
  };

  it('returns paginated student list', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);

    const result = await listStudents({ page: 1, limit: 20 });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].student.firstName).toBe('Ada');
    expect(result.meta.total).toBe(1);
  });

  it('maps riskTier and riskScore from the latest riskScore entry', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.riskTier).toBe('medium');
    expect(student.lastWeek).toBe(3);
    expect(student.lastStatus).toBe('submitted');
  });

  it('returns null for risk fields when no risk score exists', async () => {
    const noRisk = { ...fakePlacement, riskScores: [], logbookSubmissions: [] };
    (mp.placement.findMany as jest.Mock).mockResolvedValue([noRisk]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.riskTier).toBeNull();
    expect(student.riskScore).toBeNull();
    expect(student.lastWeek).toBeNull();
  });

  it('passes riskTier filter to prisma when provided', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(0);

    await listStudents({ page: 1, limit: 20, riskTier: 'high' });

    const call = (mp.placement.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ riskScores: { some: { riskTier: 'high' } } });
  });

  it('does not add riskScores filter when riskTier is omitted', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(0);

    await listStudents({ page: 1, limit: 20 });

    const call = (mp.placement.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('riskScores');
  });
});

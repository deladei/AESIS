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
    logbookAnalysis: {
      aggregate: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    cohortConfig: {
      findFirst: jest.fn(),
      update:    jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import {
  getCoordinatorDashboard,
  listStudents,
  getRecentActivity,
  getActiveCohortConfig,
  updateActiveCohortConfig,
} from '../coordinator.service';

const mp = prisma as jest.Mocked<typeof prisma>;

// Defaults so the two extra dashboard queries (avg quality + partner companies)
// don't blow up tests that only assert on other fields.
function stubDashboardExtras(opts: { avgQuality?: number | null; companies?: number } = {}) {
  (mp.logbookAnalysis.aggregate as jest.Mock).mockResolvedValue({
    _avg: { qualityScore: opts.avgQuality ?? null },
  });
  (mp.placement.findMany as jest.Mock).mockResolvedValue(
    Array.from({ length: opts.companies ?? 0 }, (_, i) => ({ companyId: `c-${i}` })),
  );
}

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

    stubDashboardExtras({ avgQuality: 87.25, companies: 24 });

    const result = await getCoordinatorDashboard();

    expect(result.overview.activePlacements).toBe(40);
    expect(result.overview.pendingApprovals).toBe(5);
    expect(result.overview.highRiskCount).toBe(5);
    // (36 + 32) / (40 + 40) = 68 / 80 = 85%
    expect(result.overview.complianceRate).toBe(85);
    // 87.25 rounded to 1 dp
    expect(result.overview.avgPerformance).toBe(87.3);
    expect(result.overview.partnerCompanies).toBe(24);
  });

  it('returns avgPerformance null when no analyses exist', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    stubDashboardExtras({ avgQuality: null, companies: 0 });

    const result = await getCoordinatorDashboard();

    expect(result.overview.avgPerformance).toBeNull();
    expect(result.overview.partnerCompanies).toBe(0);
  });

  it('returns complianceRate 100 when no submissions are scheduled', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([])   // scheduled
      .mockResolvedValueOnce([]);  // submitted
    stubDashboardExtras();

    const result = await getCoordinatorDashboard();

    expect(result.overview.complianceRate).toBe(100);
  });

  it('builds riskDistribution with zero counts for missing tiers', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([
      { riskTier: 'high', _count: { _all: 3 } },
    ]);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([]);
    stubDashboardExtras();

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
    stubDashboardExtras();

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
    student: {
      id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@uni.edu',
      programme: { name: 'Computer Science' },
    },
    academicSupervisor: { id: 's-1', firstName: 'Kofi', lastName: 'Adjei' },
    riskScores: [{ riskTier: 'medium', riskScore: { toNumber: () => 0.55 }, computedAt: new Date() }],
    logbookSubmissions: [{
      weekNumber:       3,
      submissionStatus: 'submitted',
      submittedAt:      new Date('2026-01-20'),
    }],
    _count: { logbookSubmissions: 24 },
  };

  it('returns paginated student list', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-1', _count: { _all: 6 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20 });

    expect(result.students).toHaveLength(1);
    expect(result.students[0].student.firstName).toBe('Ada');
    expect(result.meta.total).toBe(1);
  });

  it('maps department, supervisor and logbook progress', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-1', _count: { _all: 6 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.department).toBe('Computer Science');
    expect(student.supervisor).toEqual({ id: 's-1', name: 'Kofi Adjei' });
    expect(student.totalWeeks).toBe(24);
    expect(student.submittedWeeks).toBe(6);
    expect(student.progressPct).toBe(25); // 6 / 24
  });

  it('maps riskTier and riskScore from the latest riskScore entry', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-1', _count: { _all: 6 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.riskTier).toBe('medium');
    expect(student.lastWeek).toBe(3);
    expect(student.lastStatus).toBe('submitted');
  });

  it('returns null/zero for empty fields when no risk score or submissions exist', async () => {
    const noRisk = {
      ...fakePlacement,
      academicSupervisor: null,
      student: { ...fakePlacement.student, programme: null },
      riskScores: [],
      logbookSubmissions: [],
      _count: { logbookSubmissions: 0 },
    };
    (mp.placement.findMany as jest.Mock).mockResolvedValue([noRisk]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookSubmission.groupBy as jest.Mock).mockResolvedValue([]);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.riskTier).toBeNull();
    expect(student.riskScore).toBeNull();
    expect(student.lastWeek).toBeNull();
    expect(student.department).toBeNull();
    expect(student.supervisor).toBeNull();
    expect(student.progressPct).toBe(0);
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

// ── getRecentActivity ─────────────────────────────────────────

describe('getRecentActivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps audit rows to actor + human summary', async () => {
    (mp.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'a-1', action: 'placement_status_change', entityType: 'placement',
        entityId: 'p-1', metadata: { change: 'supervisor_assigned' },
        createdAt: new Date('2026-05-30T10:42:00Z'),
        user: { firstName: 'Kofi', lastName: 'Adjei', role: 'coordinator' },
      },
      {
        id: 'a-2', action: 'placement_status_change', entityType: 'placement',
        entityId: 'p-2', metadata: { status: 'active' },
        createdAt: new Date('2026-05-30T09:15:00Z'),
        user: { firstName: 'Ama', lastName: 'Owusu', role: 'coordinator' },
      },
    ]);

    const result = await getRecentActivity(8);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'a-1', actor: 'Kofi Adjei',
      summary: 'Assigned an academic supervisor to a placement',
    });
    expect(result[1].summary).toBe('Changed a placement status to "active"');
  });

  it('falls back to a readable label for unknown actions', async () => {
    (mp.auditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'a-3', action: 'data_export', entityType: 'report', entityId: 'r-1',
        metadata: null, createdAt: new Date(),
        user: { firstName: 'Yaa', lastName: 'Asante', role: 'admin' },
      },
    ]);

    const result = await getRecentActivity();

    expect(result[0].summary).toBe('Exported data');
  });
});

// ── getActiveCohortConfig ─────────────────────────────────────

describe('getActiveCohortConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the active year config in flattened shape', async () => {
    (mp.cohortConfig.findFirst as jest.Mock).mockResolvedValue({
      id: 'cc-1', minWeeklyHours: 40, totalWeeks: 24,
      academicYear: { id: 'ay-1', label: '2024/2025' },
    });

    const result = await getActiveCohortConfig();

    expect(result).toEqual({
      id: 'cc-1', minWeeklyHours: 40, totalWeeks: 24,
      academicYearId: 'ay-1', academicYearLabel: '2024/2025',
    });
    // Scopes to the active academic year.
    const call = (mp.cohortConfig.findFirst as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ academicYear: { isActive: true } });
  });

  it('throws 404 when no active cohort config exists', async () => {
    (mp.cohortConfig.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(getActiveCohortConfig()).rejects.toThrow('No cohort configuration');
  });
});

// ── updateActiveCohortConfig ──────────────────────────────────

describe('updateActiveCohortConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the active cohort by id and returns the flattened shape', async () => {
    (mp.cohortConfig.findFirst as jest.Mock).mockResolvedValue({ id: 'cc-1' });
    (mp.cohortConfig.update as jest.Mock).mockResolvedValue({
      id: 'cc-1', minWeeklyHours: 35, totalWeeks: 24,
      academicYear: { id: 'ay-1', label: '2024/2025' },
    });

    const result = await updateActiveCohortConfig({ minWeeklyHours: 35 });

    const call = (mp.cohortConfig.update as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'cc-1' });
    expect(call.data).toEqual({ minWeeklyHours: 35 });
    expect(result.minWeeklyHours).toBe(35);
    expect(result.academicYearLabel).toBe('2024/2025');
  });

  it('throws 404 (and never writes) when no active cohort config exists', async () => {
    (mp.cohortConfig.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(updateActiveCohortConfig({ minWeeklyHours: 35 })).rejects.toThrow(
      'No cohort configuration',
    );
    expect(mp.cohortConfig.update as jest.Mock).not.toHaveBeenCalled();
  });
});

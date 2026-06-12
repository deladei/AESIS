jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:     jest.fn(),
      findMany:  jest.fn(),
      findUnique: jest.fn(),
    },
    studentRiskScore: {
      groupBy:  jest.fn(),
      findMany: jest.fn(),
    },
    logbookSubmission: {
      groupBy: jest.fn(),
    },
    logbookEntry: {
      groupBy:  jest.fn(),
      findMany: jest.fn(),
    },
    entryEvent: {
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    logbookAnalysis: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    cohortConfig: {
      findFirst: jest.fn(),
      update:    jest.fn(),
    },
    academicProgramme: {
      findMany: jest.fn(),
    },
    academicYear: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import {
  getCoordinatorDashboard,
  listStudents,
  listProgrammes,
  listCohorts,
  getStudentDetail,
  messageStudent,
  remindStudent,
  getRecentActivity,
  getActiveCohortConfig,
  updateActiveCohortConfig,
  getOversight,
} from '../coordinator.service';

const mp = prisma as jest.Mocked<typeof prisma>;

// Defaults so the two extra dashboard queries (quality scores + host companies)
// don't blow up tests that only assert on other fields. `scores` are the raw
// per-analysis quality scores the service now averages via the clamped path.
function stubDashboardExtras(opts: { scores?: (number | string | null)[]; companies?: number } = {}) {
  (mp.logbookAnalysis.findMany as jest.Mock).mockResolvedValue(
    (opts.scores ?? []).map((s) => ({ qualityScore: s })),
  );
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

    stubDashboardExtras({ scores: [87.25], companies: 24 });

    const result = await getCoordinatorDashboard();

    expect(result.overview.activePlacements).toBe(40);
    expect(result.overview.pendingApprovals).toBe(5);
    expect(result.overview.highRiskCount).toBe(5);
    // (36 + 32) / (40 + 40) = 68 / 80 = 85%
    expect(result.overview.complianceRate).toBe(85);
    // 87.25 rounded to 1 dp
    expect(result.overview.avgPerformance).toBe(87.3);
    expect(result.overview.hostCompanies).toBe(24);
    // AI Pulse Matching is roadmap-only — flag defaults off (no env set in tests).
    expect(result.featureFlags.aiPulseMatching).toBe(false);
  });

  it('returns avgPerformance null when no analyses exist', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    stubDashboardExtras({ scores: [], companies: 0 });

    const result = await getCoordinatorDashboard();

    expect(result.overview.avgPerformance).toBeNull();
    expect(result.overview.hostCompanies).toBe(0);
  });

  it('excludes an out-of-range stored score so avgPerformance can never leave [0, 100]', async () => {
    (mp.placement.count as jest.Mock).mockResolvedValue(0);
    (mp.studentRiskScore.groupBy as jest.Mock).mockResolvedValue([]);
    (mp.logbookSubmission.groupBy as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    // A corrupt 151565326582 and a negative -5 must be dropped (Decimal-as-string
    // included); the valid 80 & 60 average to 70 — the metric stays in range.
    stubDashboardExtras({ scores: ['80', '151565326582', '60', '-5'], companies: 3 });

    const result = await getCoordinatorDashboard();

    expect(result.overview.avgPerformance).toBe(70);
    expect(result.overview.avgPerformance!).toBeGreaterThanOrEqual(0);
    expect(result.overview.avgPerformance!).toBeLessThanOrEqual(100);
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
    logbookEntries: [{
      weekNumber:  3,
      status:      'submitted',
      submittedAt: new Date('2026-01-20'),
    }],
  };

  it('returns paginated student list', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
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
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-1', _count: { _all: 6 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20 });
    const student = result.students[0];

    expect(student.department).toBe('Computer Science');
    expect(student.supervisor).toEqual({ id: 's-1', name: 'Kofi Adjei' });
    expect(student.totalWeeks).toBe(6);      // fixed 6-week programme
    expect(student.submittedWeeks).toBe(6);
    expect(student.progressPct).toBe(100);   // 6 / 6
  });

  it('maps riskTier and riskScore from the latest riskScore entry', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([fakePlacement]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
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
      logbookEntries: [],
    };
    (mp.placement.findMany as jest.Mock).mockResolvedValue([noRisk]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(1);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([]);

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

  // Row shape matching STUDENT_SELECT.
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'p-1', createdAt: new Date('2026-01-01'),
    student: { id: 'u-1', firstName: 'Ada', lastName: 'Lovelace', email: 'a@x.edu', programme: { name: 'CS' } },
    academicSupervisor: { id: 's-1', firstName: 'Theo', lastName: 'Walls' },
    riskScores: [{ riskTier: 'low', riskScore: 0.2, computedAt: new Date() }],
    logbookEntries: [{ weekNumber: 3, status: 'submitted', submittedAt: new Date() }],
    ...over,
  });

  it('filters by the latest entry status in memory (count not used)', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      row({ id: 'p-1', logbookEntries: [{ weekNumber: 3, status: 'submitted', submittedAt: new Date() }] }),
      row({ id: 'p-2', logbookEntries: [{ weekNumber: 2, status: 'draft', submittedAt: null }] }),
      row({ id: 'p-3', logbookEntries: [] }), // not_started
    ]);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-1', _count: { _all: 3 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20, status: 'submitted' });

    expect(result.students.map(s => s.placementId)).toEqual(['p-1']);
    expect(result.meta.total).toBe(1);
    expect(mp.placement.count).not.toHaveBeenCalled(); // in-memory path
  });

  it('sorts by computed progress descending', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      row({ id: 'p-low' }), row({ id: 'p-high' }),
    ]);
    (mp.logbookEntry.groupBy as jest.Mock).mockResolvedValue([
      { placementId: 'p-low',  _count: { _all: 2 } },
      { placementId: 'p-high', _count: { _all: 5 } },
    ]);

    const result = await listStudents({ page: 1, limit: 20, sortBy: 'progress', sortDir: 'desc' });

    expect(result.students.map(s => s.placementId)).toEqual(['p-high', 'p-low']);
  });

  it('maps an "unassigned" supervisor filter to academicSupervisorId: null', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(0);

    await listStudents({ page: 1, limit: 20, supervisorId: 'unassigned' });

    const call = (mp.placement.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.academicSupervisorId).toBeNull();
  });

  it('passes a DB-native sort (department) as orderBy, not in memory', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);
    (mp.placement.count   as jest.Mock).mockResolvedValue(0);

    await listStudents({ page: 1, limit: 20, sortBy: 'department', sortDir: 'asc' });

    const call = (mp.placement.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual({ student: { programme: { name: 'asc' } } });
    expect(call.take).toBe(20); // paged in the DB
  });
});

// ── filter options ────────────────────────────────────────────

describe('listProgrammes / listCohorts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns programmes ordered by name', async () => {
    (mp.academicProgramme.findMany as jest.Mock).mockResolvedValue([{ id: 'pr-1', name: 'CS' }]);
    const result = await listProgrammes();
    expect(result).toEqual([{ id: 'pr-1', name: 'CS' }]);
  });

  it('returns cohorts (academic years)', async () => {
    (mp.academicYear.findMany as jest.Mock).mockResolvedValue([{ id: 'ay-1', label: '2025/2026', isActive: true }]);
    const result = await listCohorts();
    expect(result).toEqual([{ id: 'ay-1', label: '2025/2026', isActive: true }]);
  });
});

// ── getStudentDetail ──────────────────────────────────────────

describe('getStudentDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 404 when the placement does not exist', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(getStudentDetail('missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('aggregates profile, progress, validated avg quality and feedback', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({
      id: 'p-1', placementStatus: 'active', startDate: new Date('2026-05-18'), endDate: new Date('2026-06-29'),
      student: { id: 'u-1', firstName: 'Ama', lastName: 'Mensah', email: 'ama@x.edu', programme: { name: 'CS' } },
      company: { name: 'Hubtel' }, academicYear: { label: '2025/2026' },
      academicSupervisor: { id: 's-1', firstName: 'Theo', lastName: 'Walls', email: 't@x.edu' },
      companySupervisor: null,
    });
    (mp.logbookEntry.findMany    as jest.Mock).mockResolvedValue([
      { id: 'e1', weekNumber: 1, status: 'acknowledged', periodStart: new Date(), periodEnd: new Date(), submittedAt: new Date(), hoursLogged: '40' },
      { id: 'e2', weekNumber: 2, status: 'draft',        periodStart: new Date(), periodEnd: new Date(), submittedAt: null,       hoursLogged: null },
    ]);
    (mp.studentRiskScore.findMany as jest.Mock).mockResolvedValue([
      { riskTier: 'low', riskScore: 0.2, computedAt: new Date() },
    ]);
    (mp.entryEvent.findMany       as jest.Mock).mockResolvedValue([
      { comment: 'Nice work', toStatus: 'acknowledged', createdAt: new Date(), actor: { firstName: 'Theo', lastName: 'Walls' }, entry: { weekNumber: 1 } },
    ]);
    (mp.auditLog.findMany         as jest.Mock).mockResolvedValue([
      { metadata: { change: 'supervisor_assigned', kind: 'academic' }, createdAt: new Date(), user: { firstName: 'Coord', lastName: 'One' } },
    ]);
    // One valid score + one corrupt — corrupt must be excluded (clamped path).
    (mp.logbookAnalysis.findMany  as jest.Mock).mockResolvedValue([
      { qualityScore: '82' }, { qualityScore: '151565326582' },
    ]);

    const r = await getStudentDetail('p-1');

    expect(r.student.name).toBe('Ama Mensah');
    expect(r.supervisors.academic).toMatchObject({ name: 'Theo Walls' });
    expect(r.supervisors.company).toBeNull();
    expect(r.progress).toMatchObject({ submittedWeeks: 1, totalWeeks: 6, progressPct: 17 });
    expect(r.avgQuality).toBe(82);            // corrupt 151565326582 excluded
    expect(r.entries).toHaveLength(2);
    expect(r.feedback[0]).toMatchObject({ week: 1, comment: 'Nice work', by: 'Theo Walls' });
    expect(r.supervisorHistory[0]).toMatchObject({ kind: 'academic', by: 'Coord One' });
  });
});

// ── messageStudent / remindStudent ────────────────────────────

describe('messageStudent / remindStudent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a system notification to the placement student', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ studentId: 'u-1' });
    (mp.notification.create  as jest.Mock).mockResolvedValue({ id: 'n-1', type: 'system', title: 'Message from your coordinator', createdAt: new Date() });

    const r = await messageStudent('p-1', 'coord-1', 'Please submit week 3.');

    expect(r).toEqual({ ok: true });
    expect(mp.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-1', type: 'system', body: 'Please submit week 3.' }),
    });
  });

  it('sends a submission_reminder notification', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue({ studentId: 'u-1' });
    (mp.notification.create  as jest.Mock).mockResolvedValue({ id: 'n-2', type: 'submission_reminder', title: 'Logbook reminder', createdAt: new Date() });

    await remindStudent('p-1', 'coord-1');

    expect(mp.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u-1', type: 'submission_reminder' }),
    });
  });

  it('throws 404 when the placement does not exist', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(messageStudent('missing', 'coord-1', 'hi')).rejects.toMatchObject({ statusCode: 404 });
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

// ── getOversight ──────────────────────────────────────────────

describe('getOversight', () => {
  beforeEach(() => jest.clearAllMocks());

  const NOW = new Date('2026-06-11T00:00:00Z');
  const PAST = new Date('2026-05-01T00:00:00Z'); // period already ended
  const FUTURE = new Date('2026-12-01T00:00:00Z'); // period not yet ended

  function placement(over: Record<string, unknown> = {}) {
    return {
      id: 'p-1',
      student: { id: 's-1', firstName: 'Kwame', lastName: 'Mensah', email: 'k@cs.edu', programme: { name: 'CS' } },
      academicSupervisor: { id: 'sup-1', firstName: 'Ama', lastName: 'Owusu' },
      riskScores: [{ riskTier: 'low' }],
      logbookEntries: [],
      logbookSubmissions: [],
      ...over,
    };
  }

  it('flags overdue draft logs whose period has ended (not future ones)', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        logbookEntries: [
          { status: 'draft',        periodEnd: PAST,   submittedAt: null, updatedAt: PAST },
          { status: 'draft',        periodEnd: FUTURE, submittedAt: null, updatedAt: NOW },  // not overdue
          { status: 'acknowledged', periodEnd: PAST,   submittedAt: PAST, updatedAt: PAST },  // submitted, not overdue
        ],
        logbookSubmissions: [{ submittedAt: PAST, analysis: { qualityScore: '80' }, feedback: [{ submittedAt: PAST }] }],
      }),
    ]);

    const { rows, summary } = await getOversight(NOW);

    expect(rows[0].flags.overdueLogs).toBe(1);
    expect(rows[0].atRisk).toBe(true);
    expect(summary).toEqual({ total: 1, atRisk: 1 });
  });

  it('flags a low validated average score and excludes out-of-range/null from the mean', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        logbookEntries: [{ status: 'acknowledged', periodEnd: PAST, submittedAt: PAST, updatedAt: PAST }],
        logbookSubmissions: [
          { submittedAt: PAST, analysis: { qualityScore: '40' },  feedback: [{ submittedAt: PAST }] },
          { submittedAt: PAST, analysis: { qualityScore: '999' }, feedback: [] }, // out of range — excluded
          { submittedAt: PAST, analysis: { qualityScore: null },  feedback: [] }, // null — excluded
        ],
      }),
    ]);

    const { rows } = await getOversight(NOW);

    expect(rows[0].avgQualityScore).toBe(40);        // only the valid 40 counts
    expect(rows[0].flags.lowAvgScore).toBe(true);
    expect(rows[0].atRisk).toBe(true);
  });

  it('reports avgQualityScore = null (not 0) when nothing is scorable, and does not flag low', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        logbookEntries: [{ status: 'acknowledged', periodEnd: PAST, submittedAt: PAST, updatedAt: PAST }],
        logbookSubmissions: [{ submittedAt: PAST, analysis: { qualityScore: null }, feedback: [{ submittedAt: PAST }] }],
      }),
    ]);

    const { rows } = await getOversight(NOW);

    expect(rows[0].avgQualityScore).toBeNull();
    expect(rows[0].flags.lowAvgScore).toBe(false);
  });

  it('flags no supervisor feedback when there is neither written feedback nor an acknowledged week', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        logbookEntries: [{ status: 'submitted', periodEnd: FUTURE, submittedAt: PAST, updatedAt: PAST }],
        logbookSubmissions: [{ submittedAt: PAST, analysis: { qualityScore: '90' }, feedback: [] }],
      }),
    ]);

    const { rows } = await getOversight(NOW);

    expect(rows[0].flags.noSupervisorFeedback).toBe(true);
    expect(rows[0].atRisk).toBe(true);
  });

  it('a healthy intern has no flags, a computed average, and a last-activity timestamp', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        logbookEntries: [{ status: 'acknowledged', periodEnd: PAST, submittedAt: PAST, updatedAt: PAST }],
        logbookSubmissions: [{ submittedAt: PAST, analysis: { qualityScore: '85' }, feedback: [{ submittedAt: PAST }] }],
      }),
    ]);

    const { rows } = await getOversight(NOW);

    expect(rows[0]).toMatchObject({
      atRisk: false,
      avgQualityScore: 85,
      flags: { overdueLogs: 0, lowAvgScore: false, noSupervisorFeedback: false },
      supervisor: { id: 'sup-1', name: 'Ama Owusu' },
      department: 'CS',
    });
    expect(rows[0].lastActivityAt).toBe(PAST.toISOString());
  });

  it('sorts at-risk interns ahead of healthy ones', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      placement({
        id: 'healthy',
        logbookEntries: [{ status: 'acknowledged', periodEnd: PAST, submittedAt: PAST, updatedAt: PAST }],
        logbookSubmissions: [{ submittedAt: PAST, analysis: { qualityScore: '85' }, feedback: [{ submittedAt: PAST }] }],
      }),
      placement({
        id: 'risky',
        logbookEntries: [{ status: 'draft', periodEnd: PAST, submittedAt: null, updatedAt: PAST }],
        logbookSubmissions: [],
      }),
    ]);

    const { rows } = await getOversight(NOW);

    expect(rows.map((r) => r.placementId)).toEqual(['risky', 'healthy']);
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

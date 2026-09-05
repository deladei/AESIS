jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      findMany: jest.fn(),
      count:    jest.fn().mockResolvedValue(0),
    },
    // Pending review is counted from the ACTIVE pipeline now. It used to count
    // logbook_submissions, a table with no writer, so the figure was always 0
    // in production however many weeks were really waiting.
    logbookEntry: {
      count: jest.fn().mockResolvedValue(0),
    },
    visitSchedule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    approvalRequest: {
      count: jest.fn().mockResolvedValue(0),
    },
    // Programme length is looked up per cohort; "no config" falls back to the
    // schema default, which is what these cases care about.
    cohortConfig: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import { getSupervisorDashboard } from '../supervisor.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:      'p-1',
  student: { id: 'u-1', firstName: 'Ade', lastName: 'Babatunde', email: 'ade@uni.edu' },
  riskScores: [{ riskTier: 'medium', riskScore: 0.52 }],
  startDate: new Date('2026-01-05'),
  academicYearId: 'ay-1',
  finalizationStatus: 'active',
  company: { name: 'Hubtel' },
  // Quality and recent weeks come from the LIVE entries pipeline now. Reading
  // them off `logbook_submissions` meant every student row said "no
  // submissions yet" in production, because nothing writes that table.
  logbookEntries: [
    { weekNumber: 4, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 80 } }] },
    { weekNumber: 3, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 74 } }] },
    { weekNumber: 2, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 70 } }] },
    { weekNumber: 1, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 60 } }] },
  ],
  logbookSubmissions: [],
  _count: { logbookEntries: 4 },
  ...overrides,
});

describe('getSupervisorDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns overview with correct assignedStudents and pendingReview', async () => {
    (mp.placement.findMany       as jest.Mock).mockResolvedValue([makePlacement(), makePlacement({ id: 'p-2' })]);
    (mp.logbookEntry.count  as jest.Mock).mockResolvedValue(3);

    const result = await getSupervisorDashboard('sup-1');

    expect(result.overview.assignedStudents).toBe(2);
    expect(result.overview.pendingReview).toBe(3);
  });

  it('calculates avgQualityScore correctly', async () => {
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([makePlacement()]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    // (80 + 74 + 70 + 60) / 4 = 71
    expect(result.overview.avgQualityScore).toBe(71);
    expect(result.students[0].avgQualityScore).toBe(71);
  });

  it('excludes an unassessed entry from avgQualityScore', async () => {
    const withV2 = makePlacement({
      logbookEntries: [
        { weekNumber: 2, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 80 } }] },
        { weekNumber: 1, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 60 } }] },
        { weekNumber: 3, status: 'submitted', submittedAt: new Date(), assessments: [] },
      ],
      logbookSubmissions: [],
      _count: { logbookEntries: 3 },
    });
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([withV2]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    // (80 + 60) / 2 = 70; the entry with no assessment is in neither half.
    expect(result.students[0].avgQualityScore).toBe(70);
  });

  it('uses v2 assessments alone once legacy analyses stop (post-S82 cohorts)', async () => {
    const v2Only = makePlacement({
      logbookEntries: [
        { weekNumber: 2, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 90 } }] },
        { weekNumber: 1, status: 'acknowledged', submittedAt: new Date(), assessments: [{ quality: { overall: 70 } }] },
      ],
      logbookSubmissions: [],
      _count: { logbookEntries: 2 },
    });
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([v2Only]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    expect(result.students[0].avgQualityScore).toBe(80);
  });

  it('returns recentWeeks oldest-first (for sparkline)', async () => {
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([makePlacement()]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');
    const weeks = result.students[0].recentWeeks.map(w => w.week);

    // Entries are fetched week-desc (4,3,2,1) → reversed to oldest-first.
    expect(weeks).toEqual([1, 2, 3, 4]);
  });

  it('returns null avgQualityScore when no analysis data exists', async () => {
    const noAnalysis = makePlacement({
      logbookEntries: [
        { weekNumber: 1, status: 'draft', submittedAt: null, assessments: [] },
      ],
      logbookSubmissions: [],
      _count: { logbookEntries: 0 },
    });
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([noAnalysis]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    expect(result.students[0].avgQualityScore).toBeNull();
    expect(result.overview.avgQualityScore).toBeNull();
  });

  it('returns empty students and zero overview for supervisor with no placements', async () => {
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    expect(result.students).toHaveLength(0);
    expect(result.overview.assignedStudents).toBe(0);
    expect(result.overview.avgQualityScore).toBeNull();
  });

  it('maps riskTier and riskScore from latest riskScore entry', async () => {
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([makePlacement()]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');
    const student = result.students[0];

    expect(student.riskTier).toBe('medium');
    expect(student.riskScore).toBeCloseTo(0.52);
  });

  it('handles null riskScores gracefully', async () => {
    const noRisk = makePlacement({ riskScores: [] });
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([noRisk]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');
    const student = result.students[0];

    expect(student.riskTier).toBeNull();
    expect(student.riskScore).toBeNull();
  });
});

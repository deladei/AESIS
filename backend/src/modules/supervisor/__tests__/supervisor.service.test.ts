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
  },
}));

import { prisma } from '../../../config/prisma';
import { getSupervisorDashboard } from '../supervisor.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:      'p-1',
  student: { id: 'u-1', firstName: 'Ade', lastName: 'Babatunde', email: 'ade@uni.edu' },
  riskScores: [{ riskTier: 'medium', riskScore: 0.52 }],
  logbookSubmissions: [
    { weekNumber: 4, submissionStatus: 'approved', submittedAt: new Date(), analysis: { qualityScore: 80 } },
    { weekNumber: 3, submissionStatus: 'approved', submittedAt: new Date(), analysis: { qualityScore: 74 } },
    { weekNumber: 2, submissionStatus: 'approved', submittedAt: new Date(), analysis: { qualityScore: 70 } },
    { weekNumber: 1, submissionStatus: 'approved', submittedAt: new Date(), analysis: { qualityScore: 60 } },
  ],
  logbookEntries: [],
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

  it('merges v2 entry-assessment quality into avgQualityScore', async () => {
    const withV2 = makePlacement({
      logbookSubmissions: [
        { weekNumber: 1, submissionStatus: 'approved', submittedAt: new Date(), analysis: { qualityScore: 80 } },
      ],
      logbookEntries: [
        { assessments: [{ quality: { overall: 60 } }] },
        { assessments: [] }, // unassessed entry contributes nothing
      ],
    });
    (mp.placement.findMany      as jest.Mock).mockResolvedValue([withV2]);
    (mp.logbookEntry.count as jest.Mock).mockResolvedValue(0);

    const result = await getSupervisorDashboard('sup-1');

    // Legacy 80 + v2 60 → mean 70; the empty assessment list is excluded.
    expect(result.students[0].avgQualityScore).toBe(70);
  });

  it('uses v2 assessments alone once legacy analyses stop (post-S82 cohorts)', async () => {
    const v2Only = makePlacement({
      logbookSubmissions: [
        { weekNumber: 1, submissionStatus: 'submitted', submittedAt: new Date(), analysis: null },
      ],
      logbookEntries: [
        { assessments: [{ quality: { overall: 90 } }] },
        { assessments: [{ quality: { overall: 70 } }] },
      ],
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

    // Logbook submissions fetched week-desc (4,3,2,1) → reversed to oldest-first
    expect(weeks).toEqual([1, 2, 3, 4]);
  });

  it('returns null avgQualityScore when no analysis data exists', async () => {
    const noAnalysis = makePlacement({
      logbookSubmissions: [
        { weekNumber: 1, submissionStatus: 'draft', submittedAt: null, analysis: null },
      ],
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

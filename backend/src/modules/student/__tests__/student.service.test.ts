jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import { getStudentDashboard } from '../student.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:              'p-1',
  startDate:       new Date('2026-01-12'),
  endDate:         new Date('2026-06-29'), // 24 weeks
  placementStatus: 'active',
  academicYear:    { cohortConfigs: [{ totalWeeks: 6 }] }, // intentionally wrong; dates must win
  logbookSubmissions: [
    { submissionStatus: 'approved',  analysis: { qualityScore: '80' } },
    { submissionStatus: 'approved',  analysis: { qualityScore: '70' } },
    { submissionStatus: 'submitted', analysis: { qualityScore: '60' } },
    { submissionStatus: 'draft',     analysis: null },
  ],
  ...overrides,
});

describe('getStudentDashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes a numeric average from Decimal-as-string scores (no concatenation)', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([makePlacement()]);

    const result = await getStudentDashboard('stu-1');

    // (80 + 70 + 60) / 3 = 70 — not "08070..." / 3
    expect(result.avgQualityScore).toBe(70);
    expect(result.avgQualityScore!).toBeLessThanOrEqual(100);
  });

  it('derives the week total from the dates, ignoring a contradictory cohort config', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([makePlacement()]);

    const result = await getStudentDashboard('stu-1');

    expect(result.week!.total).toBe(24);   // from Jan 12 – Jun 29, not the config's 6
    expect(result.expectedLogs).toBe(24);
    expect(result.week!.current).toBe(3);  // 3 submitted (draft excluded)
    expect(result.completionPct).toBe(13); // round(3/24*100)
  });

  it('returns null avgQualityScore and "—"-able state when no log is scored', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        logbookSubmissions: [
          { submissionStatus: 'draft', analysis: null },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.avgQualityScore).toBeNull();
    expect(result.logsSubmitted).toBe(0);
  });

  it('drops an out-of-range stored score so a corrupt value never reaches the UI', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        logbookSubmissions: [
          { submissionStatus: 'approved', analysis: { qualityScore: '151565326582' } },
          { submissionStatus: 'approved', analysis: { qualityScore: '80' } },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.avgQualityScore).toBe(80); // corrupt value excluded
  });

  it('returns a safe empty payload when the student has no placement', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getStudentDashboard('stu-1');

    expect(result.hasActivePlacement).toBe(false);
    expect(result.week).toBeNull();
    expect(result.avgQualityScore).toBeNull();
    expect(result.logsSubmitted).toBe(0);
  });
});

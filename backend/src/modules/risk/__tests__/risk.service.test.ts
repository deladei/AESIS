jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../config/prisma';
import { riskInputsOf, latestRiskDistribution } from '../risk.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function placement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    startDate: daysAgo(21),
    academicYearId: 'y1',
    studentId: 's1',
    academicSupervisorId: 'sup1',
    student: { id: 's1', firstName: 'Ama', lastName: 'Mensah' },
    logbookEntries: [],
    ...overrides,
  } as Parameters<typeof riskInputsOf>[0];
}

describe('riskInputsOf', () => {
  it('returns null when the placement has no start date', () => {
    expect(riskInputsOf(placement({ startDate: null }))).toBeNull();
  });

  it('derives weeks elapsed from the start date', () => {
    const input = riskInputsOf(placement())!;
    expect(input.weeksElapsed).toBe(3);
  });

  it('counts only due weeks in submitted/acknowledged as submitted', () => {
    const input = riskInputsOf(
      placement({
        logbookEntries: [
          { weekNumber: 1, status: 'acknowledged', submittedAt: daysAgo(14), days: [] },
          { weekNumber: 2, status: 'submitted', submittedAt: daysAgo(7), days: [] },
          { weekNumber: 3, status: 'draft', submittedAt: null, days: [] },
          // Week beyond the elapsed window must not count toward the ratio.
          { weekNumber: 6, status: 'submitted', submittedAt: daysAgo(1), days: [] },
        ],
      }),
    )!;
    expect(input.weeksSubmitted).toBe(2);
    expect(input.returnedCount).toBe(0);
  });

  it('collects late/submitted day logs and returned weeks', () => {
    const input = riskInputsOf(
      placement({
        logbookEntries: [
          {
            weekNumber: 1,
            status: 'returned',
            submittedAt: daysAgo(10),
            // Lateness is derived: created after the day it covers = late.
            days: [
              { status: 'submitted', submittedAt: daysAgo(10), workDate: daysAgo(10), createdAt: daysAgo(10) },
              { status: 'submitted', submittedAt: daysAgo(9), workDate: daysAgo(11), createdAt: daysAgo(9) },
              { status: 'draft', submittedAt: null, workDate: daysAgo(8), createdAt: daysAgo(8) },
            ],
          },
        ],
      }),
    )!;
    expect(input.returnedCount).toBe(1);
    expect(input.submittedDays).toBe(2);
    expect(input.lateDays).toBe(1);
  });

  it('takes days-since-last-activity from the most recent submission', () => {
    const input = riskInputsOf(
      placement({
        logbookEntries: [
          {
            weekNumber: 1,
            status: 'submitted',
            submittedAt: daysAgo(10),
            days: [{ status: 'submitted', submittedAt: daysAgo(2), workDate: daysAgo(2), createdAt: daysAgo(2) }],
          },
        ],
      }),
    )!;
    expect(input.daysSinceLastActivity).toBe(2);
  });

  it('reports null activity when nothing was ever submitted', () => {
    const input = riskInputsOf(
      placement({
        logbookEntries: [{ weekNumber: 1, status: 'draft', submittedAt: null, days: [] }],
      }),
    )!;
    expect(input.daysSinceLastActivity).toBeNull();
  });
});

describe('latestRiskDistribution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('counts each placement once by its latest snapshot only', async () => {
    // The select clause takes only the newest row per placement, so each
    // placement arrives with at most one riskScores element regardless of how
    // many movement rows exist in the history table.
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      { riskScores: [{ riskTier: 'high' }] },
      { riskScores: [{ riskTier: 'low' }] },   // was high earlier — history ignored
      { riskScores: [{ riskTier: 'low' }] },
      { riskScores: [] },                      // too new to score — omitted
    ]);

    const dist = await latestRiskDistribution({ placementStatus: 'active' });

    expect(dist).toEqual({ low: 2, medium: 0, high: 1 });
    const call = (mp.placement.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select.riskScores).toMatchObject({
      orderBy: { computedAt: 'desc' },
      take: 1,
    });
  });
});

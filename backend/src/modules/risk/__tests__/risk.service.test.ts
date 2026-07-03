import { riskInputsOf } from '../risk.service';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function placement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    startDate: daysAgo(21),
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
            days: [
              { status: 'submitted', submittedAt: daysAgo(10), loggedLate: false },
              { status: 'submitted', submittedAt: daysAgo(9), loggedLate: true },
              { status: 'draft', submittedAt: null, loggedLate: false },
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
            days: [{ status: 'submitted', submittedAt: daysAgo(2), loggedLate: false }],
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

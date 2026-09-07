jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      count:      jest.fn(),
      findMany:   jest.fn(),
      findUnique: jest.fn(),
    },
    logbookEntry: {
      count:    jest.fn(),
      findMany: jest.fn(),
      groupBy:  jest.fn(),
    },
    supervisorFeedback: {
      findMany: jest.fn(),
    },
    entryEvent: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../risk/risk.service', () => ({ refreshRiskSnapshots: jest.fn() }));
jest.mock('../../notifications/notifications.service', () => ({ createNotification: jest.fn() }));
jest.mock('../../../shared/utils/email', () => ({ sendEmail: jest.fn() }));

import { prisma } from '../../../config/prisma';
import { getAdminDashboard, getInternStats, messageIntern, scheduleCallWithIntern } from '../admin.service';
import { createNotification } from '../../notifications/notifications.service';
import { sendEmail } from '../../../shared/utils/email';

const mp = prisma as jest.Mocked<typeof prisma>;
const mockNotify = createNotification as jest.Mock;
const mockEmail = sendEmail as jest.Mock;

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
  beforeEach(() => {
    jest.clearAllMocks();
    // The activity feed is read on every dashboard build; tests that do not
    // care about it still need it to resolve.
    (mp.entryEvent.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('builds overview counts and avgEngagement = submitted / weeks actually due', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(12);
    queueCounts(54, 8, 24);
    // The denominator now comes from the placements themselves, not from
    // interns × a literal 6: each started in January, so all six of its
    // programme weeks are due → 72 scheduled, 54 submitted → 75%.
    (mp.placement.findMany     as jest.Mock).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        makePlacement({ id: `p-${i}`, startDate: new Date('2026-01-05') })),
    );
    (mp.logbookEntry.groupBy   as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([]);
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    expect(result.overview.activeInterns).toBe(12);
    expect(result.overview.pendingReviews).toBe(8);
    expect(result.overview.avgEngagement).toBe(90); // round(54/60*100) — 5-week cohorts
    expect(result.submissionCounts).toEqual({ pending: 8, reviewed: 24 });
  });

  it('reports a null trend point rather than a zero for a week nobody scored', async () => {
    // A week with no assessments is not a week that scored zero, and a week
    // nobody has reached is not a collapse in engagement. Both draw as gaps.
    (mp.placement.count       as jest.Mock).mockResolvedValue(2);
    queueCounts(2, 0, 2);
    (mp.placement.findMany    as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-1', startDate: new Date('2026-01-05') }),
      makePlacement({ id: 'p-2', startDate: new Date('2026-01-05') }),
    ]);
    (mp.logbookEntry.groupBy  as jest.Mock).mockResolvedValue([]);
    // Keyed on the query rather than on call order: `getAdminDashboard` reads
    // logbookEntry.findMany twice and only one of them asks for assessments.
    (mp.logbookEntry.findMany as jest.Mock).mockImplementation((args: { select?: Record<string, unknown> }) =>
      Promise.resolve(args?.select?.assessments
        // Week 1 submitted, with no assessment at all.
        ? [{ weekNumber: 1, submittedAt: new Date(), assessments: [] }]
        : []));
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();
    const week1 = result.trend.find(t => t.weekNumber === 1);

    expect(week1?.avgQuality).toBeNull();
    expect(week1?.submissionRate).not.toBeNull();
  });

  it('drops an out-of-range quality score instead of averaging it in', async () => {
    // AI values are untrusted even coming back out of our own table.
    (mp.placement.count       as jest.Mock).mockResolvedValue(1);
    queueCounts(1, 0, 1);
    (mp.placement.findMany    as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-1', startDate: new Date('2026-01-05') }),
    ]);
    (mp.logbookEntry.groupBy  as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany as jest.Mock).mockImplementation((args: { select?: Record<string, unknown> }) =>
      Promise.resolve(args?.select?.assessments
        ? [
            { weekNumber: 1, submittedAt: new Date(), assessments: [{ quality: { overall: 730 } }] },
            { weekNumber: 1, submittedAt: new Date(), assessments: [{ quality: { overall: 60 } }] },
          ]
        : []));
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();
    expect(result.trend.find(t => t.weekNumber === 1)?.avgQuality).toBe(60);
  });

  it('omits a programme from the progress bars when nothing is due for it yet', async () => {
    // Drawing it at 0% would read as a programme that has fallen behind.
    (mp.placement.count       as jest.Mock).mockResolvedValue(1);
    queueCounts(0, 0, 0);
    (mp.placement.findMany    as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-1', startDate: new Date(Date.now() + 30 * 864e5) }),
    ]);
    (mp.logbookEntry.groupBy  as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany as jest.Mock).mockResolvedValue([]);
    (mp.supervisorFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();
    expect(result.programmeProgress).toEqual([]);
  });

  it('reports avgEngagement as null — not 100 — when no interns are active', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(0);
    queueCounts(0, 0, 0);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([]);
    (mp.logbookEntry.findMany  as jest.Mock).mockResolvedValue([]);

    const result = await getAdminDashboard();

    // Nothing is due, so there is no percentage to render. A literal 100 here
    // claimed a perfect cohort where there was no cohort at all.
    expect(result.overview.avgEngagement).toBeNull();
  });

  it('ranks the pulse board by engagement desc and attaches feedback counts', async () => {
    (mp.placement.count        as jest.Mock).mockResolvedValue(2);
    queueCounts(9, 1, 3);
    (mp.placement.findMany     as jest.Mock).mockResolvedValue([
      makePlacement({ id: 'p-low', startDate: new Date('2026-01-05') }),     // 3/6 = 50%
      makePlacement({
        id: 'p-high',
        startDate: new Date('2026-01-05'),
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
      weeksDue: 5,
      programmeWeeks: 5,
      feedbackCount: 2,
      department: 'B.Sc. IT',
      riskTier: 'medium',
    });
    expect(result.pulseBoard[1]).toMatchObject({ engagementPct: 60, feedbackCount: 1 }); // 3/5
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

describe('admin messaging', () => {
  const placementWithStudent = {
    studentId: 'stu-1',
    student: { firstName: 'Ama', lastName: 'Mensah', email: 'ama@uni.edu.gh' },
  };

  beforeEach(() => { mockNotify.mockReset(); mockEmail.mockReset(); (mp.placement.findUnique as jest.Mock).mockReset(); });

  it('messageIntern notifies in-app AND emails the registered address', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(placementWithStudent);
    const res = await messageIntern('p-1', 'Please submit week 3.');
    expect(res).toMatchObject({ ok: true, emailedTo: 'ama@uni.edu.gh' });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'stu-1', type: 'system' }));
    expect(mockEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ama@uni.edu.gh' }));
  });

  it('scheduleCallWithIntern emails the Meet link + notifies, linking to the room', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(placementWithStudent);
    const res = await scheduleCallWithIntern('p-1', {
      scheduledAt: '2026-07-01T10:00:00.000Z', topic: 'Mid-term', meetLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(res.ok).toBe(true);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://meet.google.com/abc-defg-hij' }));
    expect(mockEmail.mock.calls[0][0].html).toContain('https://meet.google.com/abc-defg-hij');
  });

  it('404s on an unknown placement', async () => {
    (mp.placement.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(messageIntern('nope', 'hi')).rejects.toMatchObject({ statusCode: 404 });
    expect(mockEmail).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe('getInternStats', () => {
  const intern = (over: Record<string, unknown> = {}) => ({
    id: 'p-x',
    placementStatus: 'active',
    finalizationStatus: 'active',
    logbookEntries: [],
    logbookSubmissions: [],
    riskScores: [],
    ...over,
  });

  it('buckets every intern exactly once and averages only real scores', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      // Active but has never submitted a week → not started, whatever the
      // status column says.
      intern({ id: 'p-1' }),
      intern({
        id: 'p-2',
        logbookEntries: [{ submittedAt: new Date(), assessments: [{ quality: { overall: 80 } }] }],
        riskScores: [{ riskTier: 'high' }],
      }),
      intern({
        id: 'p-3', placementStatus: 'completed',
        logbookEntries: [{ submittedAt: new Date(), assessments: [{ quality: { overall: 60 } }] }],
      }),
      // Finalized while still "active" is still finished.
      intern({ id: 'p-4', finalizationStatus: 'finalized' }),
    ]);

    const stats = await getInternStats();

    expect(stats.total).toBe(4);
    expect(stats.notStarted).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.completed).toBe(2);
    expect(stats.notStarted + stats.inProgress + stats.completed).toBe(stats.total);
    expect(stats.atRisk).toBe(1);
    expect(stats.avgScore).toBe(70);
  });

  it('reports no average at all when nothing has been scored', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([intern()]);

    const stats = await getInternStats();
    // Not 0 — an unassessed cohort is not a failing one.
    expect(stats.avgScore).toBeNull();
  });
});

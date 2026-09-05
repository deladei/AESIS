jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../shared/utils/crypto', () => ({
  encryptPII: jest.fn((v: string) => `enc:${v}`),
  // Mirror the real "throws on malformed input" contract so safeDecryptPhone is exercised.
  decryptPII: jest.fn((v: string) => {
    if (!v.startsWith('enc:')) throw new Error('malformed');
    return v.replace('enc:', '');
  }),
}));

import { prisma } from '../../../config/prisma';
import { getStudentDashboard } from '../student.service';

const mp = prisma as jest.Mocked<typeof prisma>;

const makePlacement = (overrides: Record<string, unknown> = {}) => ({
  id:              'p-1',
  startDate:       new Date('2026-01-12'),
  endDate:         new Date('2026-06-29'), // 24 weeks
  placementStatus: 'active',
  academicYear:    { cohortConfigs: [{ durationWeeks: 6, totalWeeks: 6 }] }, // dates must win
  // Legacy submissions feed only the advisory AI quality average now.
  logbookSubmissions: [
    { submissionStatus: 'approved',  analysis: { qualityScore: '80' } },
    { submissionStatus: 'approved',  analysis: { qualityScore: '70' } },
    { submissionStatus: 'submitted', analysis: { qualityScore: '60' } },
    { submissionStatus: 'draft',     analysis: null },
  ],
  // Progress counts a week once it has any real logging — week-level submit
  // (submittedAt set) or at least one submitted day.
  logbookEntries: [
    { status: 'acknowledged', hoursLogged: null, submittedAt: new Date('2026-01-20'), days: [] },
    { status: 'submitted',    hoursLogged: null, submittedAt: new Date('2026-01-27'), days: [] },
    { status: 'returned',     hoursLogged: null, submittedAt: new Date('2026-02-03'), days: [] },
  ],
  learningObjectives: [],
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

  it('takes the week total from the real date span, not a hardcoded 6', async () => {
    // The dates span 24 weeks. SYSTEM_MAX_WEEKS used to flatten that to 6, so a
    // student in week 10 was shown "week 6 of 6" and 100% complete (S91).
    (mp.placement.findMany as jest.Mock).mockResolvedValue([makePlacement()]);

    const result = await getStudentDashboard('stu-1');

    expect(result.week!.total).toBe(24);
    expect(result.expectedLogs).toBe(24);
    expect(result.week!.current).toBe(3);  // 3 submitted (draft excluded)
    expect(result.completionPct).toBe(13); // round(3/24*100)
  });

  it('counts a draft week with any submitted day toward progress (tallies real logging, not just closed weeks)', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        logbookEntries: [
          // Week-level submit → counts.
          { status: 'acknowledged', hoursLogged: null, submittedAt: new Date('2026-01-20'), days: [{ status: 'submitted' }] },
          // Still a draft week (not closed) but the student submitted 3 of 5 days → counts.
          { status: 'draft', hoursLogged: null, submittedAt: null, days: [
            { status: 'submitted' }, { status: 'submitted' }, { status: 'submitted' },
            { status: 'draft' }, { status: 'draft' },
          ] },
          // Pure draft, nothing logged yet → does NOT count.
          { status: 'draft', hoursLogged: null, submittedAt: null, days: [{ status: 'draft' }] },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.week!.current).toBe(2);   // 1 week-submitted + 1 partially-logged
    expect(result.logsSubmitted).toBe(2);
    expect(result.completionPct).toBe(8);   // round(2/24*100) — 24-week attachment
  });

  it('returns null avgQualityScore and "—"-able state when no log is scored', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        logbookSubmissions: [
          { submissionStatus: 'draft', analysis: null },
        ],
        // No entries submitted yet → a genuine empty state.
        logbookEntries: [],
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

  it('reports objective progress counting CONFIRMED links only (AI suggestions excluded)', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        learningObjectives: [
          {
            id: 'obj-1', title: 'Apply version control',
            entryLinks: [
              { status: 'confirmed' }, { status: 'confirmed' },
              { status: 'suggested' }, // AI suggestion — must NOT count
            ],
          },
          { id: 'obj-2', title: 'Write tests', entryLinks: [{ status: 'suggested' }] },
          { id: 'obj-3', title: 'Deploy to prod', entryLinks: [] },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.objectives).toEqual([
      { id: 'obj-1', title: 'Apply version control', confirmedEntryCount: 2 },
      { id: 'obj-2', title: 'Write tests',           confirmedEntryCount: 0 },
      { id: 'obj-3', title: 'Deploy to prod',        confirmedEntryCount: 0 },
    ]);
  });

  it('returns a safe empty payload when the student has no placement', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getStudentDashboard('stu-1');

    expect(result.hasActivePlacement).toBe(false);
    expect(result.week).toBeNull();
    expect(result.avgQualityScore).toBeNull();
    expect(result.logsSubmitted).toBe(0);
    expect(result.supervisors).toEqual({ academic: null, company: null });
    expect(result.statusBreakdown).toEqual({
      approved: 0, pendingReview: 0, revisionRequested: 0, inProgress: 0, total: 0,
    });
    expect(result.hours).toEqual({ logged: 0, expected: 0, perWeekMin: 0, shortfall: false });
  });

  it('sums attendance hours over submitted+ entries and flags a shortfall against the per-week minimum', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        // 40h/week minimum. This placement's 24 weeks have all come due, so the
        // cumulative target is the full 40 × 24.
        academicYear: { cohortConfigs: [{ durationWeeks: 24, totalWeeks: 24, minWeeklyHours: 40 }] },
        logbookEntries: [
          { status: 'acknowledged', hoursLogged: '40' },    // counted
          { status: 'submitted',    hoursLogged: '37.5' },   // counted (Decimal-as-string)
          { status: 'returned',     hoursLogged: '40' },     // counted — time was still worked
          { status: 'returned',     hoursLogged: '40' },     // counted
          { status: 'draft',        hoursLogged: '10' },     // EXCLUDED — not yet submitted
          { status: 'submitted',    hoursLogged: null },     // null ignored, never concatenated
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    // 40 + 37.5 + 40 + 40 = 157.5 (draft's 10 excluded; null ignored)
    expect(result.hours).toEqual({
      logged: 157.5,
      expected: 960,   // 40/wk × the 24 weeks due
      perWeekMin: 40,
      shortfall: true,
    });
  });

  it('bills attendance against the weeks DUE, not the whole programme', async () => {
    // Two weeks into a 24-week attachment the target is 80 h, not 960 — the old
    // whole-programme denominator made every intern "below target" from day one.
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        startDate: new Date(Date.now() - 14 * 86_400_000),
        endDate:   new Date(Date.now() + 154 * 86_400_000),
        academicYear: { cohortConfigs: [{ durationWeeks: 24, totalWeeks: 24, minWeeklyHours: 40 }] },
        logbookEntries: [
          { status: 'acknowledged', hoursLogged: '40', submittedAt: new Date(), days: [] },
          { status: 'submitted',    hoursLogged: '40', submittedAt: new Date(), days: [] },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.hours!.expected).toBe(80);
    expect(result.hours!.shortfall).toBe(false);
  });

  it('never flags an hours shortfall when no per-week minimum is configured', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        academicYear: { cohortConfigs: [{ totalWeeks: 6, minWeeklyHours: 0 }] },
        logbookEntries: [{ status: 'submitted', hoursLogged: '12' }],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.hours).toEqual({ logged: 12, expected: 0, perWeekMin: 0, shortfall: false });
  });

  it('computes the per-status breakdown from the entries state machine', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        logbookEntries: [
          { status: 'acknowledged' },
          { status: 'acknowledged' },
          { status: 'submitted' },
          { status: 'returned' },
          { status: 'returned' },
          { status: 'draft' },
        ],
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.statusBreakdown).toEqual({
      approved: 2,           // acknowledged
      pendingReview: 1,      // submitted
      revisionRequested: 2,  // returned
      inProgress: 1,         // draft
      total: 6,
    });
  });

  it('surfaces both supervisors with org and a decrypted phone', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        company:            { name: 'Adinkra Microfinance' },
        academicSupervisor: { firstName: 'Kwame', lastName: 'Mensah', email: 'k.mensah@knust.edu.gh', phone: 'enc:+233201234567' },
        companySupervisor:  { firstName: 'Akosua', lastName: 'Boateng', email: 'akosua@adinkra.com', phone: null },
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    // Academic supervisor: faculty — no org; phone decrypted.
    expect(result.supervisors.academic).toEqual({
      name: 'Kwame Mensah', email: 'k.mensah@knust.edu.gh', phone: '+233201234567', organization: null,
    });
    // Company supervisor: org from the placement company; no phone on file.
    expect(result.supervisors.company).toEqual({
      name: 'Akosua Boateng', email: 'akosua@adinkra.com', phone: null, organization: 'Adinkra Microfinance',
    });
  });

  it('returns null phone (not a throw) when the stored phone is unreadable', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      makePlacement({
        academicSupervisor: { firstName: 'Yaa', lastName: 'Asante', email: 'yaa@knust.edu.gh', phone: 'corrupt-not-json' },
        companySupervisor:  null,
      }),
    ]);

    const result = await getStudentDashboard('stu-1');

    expect(result.supervisors.academic?.phone).toBeNull();
    expect(result.supervisors.company).toBeNull();
  });
});

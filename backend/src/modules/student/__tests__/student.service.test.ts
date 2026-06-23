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
  academicYear:    { cohortConfigs: [{ totalWeeks: 6 }] }, // intentionally wrong; dates must win
  // Legacy submissions feed only the advisory AI quality average now.
  logbookSubmissions: [
    { submissionStatus: 'approved',  analysis: { qualityScore: '80' } },
    { submissionStatus: 'approved',  analysis: { qualityScore: '70' } },
    { submissionStatus: 'submitted', analysis: { qualityScore: '60' } },
    { submissionStatus: 'draft',     analysis: null },
  ],
  // Progress counts entries that have actually been submitted (submittedAt set).
  logbookEntries: [
    { status: 'acknowledged', hoursLogged: null, submittedAt: new Date('2026-01-20') },
    { status: 'submitted',    hoursLogged: null, submittedAt: new Date('2026-01-27') },
    { status: 'returned',     hoursLogged: null, submittedAt: new Date('2026-02-03') },
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

  it('caps the week total at the system-wide 6, even though the dates span longer', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([makePlacement()]);

    const result = await getStudentDashboard('stu-1');

    expect(result.week!.total).toBe(6);    // capped — the internship is a fixed 6-week programme
    expect(result.expectedLogs).toBe(6);
    expect(result.week!.current).toBe(3);  // 3 submitted (draft excluded)
    expect(result.completionPct).toBe(50); // round(3/6*100)
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
        // 40h/week minimum; weeks capped at the system-wide 6 → expected 240h.
        academicYear: { cohortConfigs: [{ totalWeeks: 6, minWeeklyHours: 40 }] },
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
      expected: 240,   // 40/wk × 6 weeks (capped)
      perWeekMin: 40,
      shortfall: true,
    });
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

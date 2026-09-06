jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      findMany: jest.fn(),
    },
    // Programme length is per cohort, so the feedback picker resolves it the
    // same way every other week-aware surface does.
    cohortConfig: {
      findMany: jest.fn().mockResolvedValue([{ academicYearId: 'ay-1', durationWeeks: 6 }]),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import { getInsights, listInternsForFeedback } from '../insights.service';

const mp = prisma as jest.Mocked<typeof prisma>;

// Build a logbook_entry row in the shape getInsights selects.
const entry = (
  weekNumber: number,
  opts: { submitted?: boolean; hours?: number | null; tags?: string[]; relevance?: number | null },
) => ({
  weekNumber,
  submittedAt: opts.submitted ? new Date('2026-01-05') : null,
  hoursLogged: opts.hours ?? null,
  activities:  opts.tags ? [{ competencyTags: opts.tags }] : [],
  assessments: opts.relevance != null ? [{ relevance: opts.relevance }] : [],
});

beforeEach(() => jest.clearAllMocks());

describe('getInsights', () => {
  it('aggregates performance, relevance trend, hours, competencies and summaries from entries', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        // Started in January, so all six programme weeks have come due and
        // engagement is submitted/due rather than "nothing owed yet".
        startDate: new Date('2026-01-05'),
        student: { firstName: 'Akosua', lastName: 'Mensah' },
        company: { name: 'Sankofa Software Ltd.' },
        logbookEntries: [
          entry(1, { submitted: true, hours: 40, tags: ['Python', 'Testing'], relevance: 0.80 }),
          entry(2, { submitted: true, hours: 36, tags: ['Python'],            relevance: 0.90 }),
          entry(3, { submitted: true, hours: 38, tags: ['Python', 'SQL'],     relevance: 1.00 }),
          entry(4, { submitted: true, hours: 40, tags: ['Python'],            relevance: 0.90 }),
          entry(5, { submitted: true, hours: 40, tags: ['Testing'],           relevance: 0.90 }),
          entry(6, { submitted: true, hours: 40, tags: ['Python'],            relevance: 0.90 }),
        ],
      },
      {
        id: 'p2',
        startDate: new Date('2026-01-05'),
        student: { firstName: 'Yaw', lastName: 'Asante' },
        company: { name: 'Ananse Technologies Ltd.' },
        logbookEntries: [
          entry(1, { submitted: true, hours: 10, tags: ['Python'], relevance: 0.40 }),
          entry(2, { submitted: false }),
        ],
      },
    ]);

    const r = await getInsights({});

    expect(r.overview.activeInterns).toBe(2);
    expect(r.overview.flaggedCount).toBe(1);

    // Akosua: 6/6 submitted → 100% engagement; relevance mean(80,90,100,90,90,90)=90.
    const akosua = r.performanceMonitoring.find(p => p.name === 'Akosua Mensah')!;
    expect(akosua.engagementPct).toBe(100);
    expect(akosua.engagementLabel).toBe('High');
    expect(akosua.relevanceScore).toBe(90);
    expect(akosua.status).toBe('On Track');
    expect(akosua.flagged).toBe(false);

    // Yaw: 1/5 submitted → 20% engagement → flagged At Risk; relevance mean(40)=40.
    const yaw = r.performanceMonitoring.find(p => p.name === 'Yaw Asante')!;
    expect(yaw.engagementPct).toBe(20);
    expect(yaw.flagged).toBe(true);
    expect(yaw.status).toBe('At Risk');
    expect(yaw.relevanceScore).toBe(40);

    // Relevance trend per week across all enriched entries.
    expect(r.relevanceTrend).toEqual([
      { week: 1, avgRelevance: 60 }, // (80 + 40) / 2
      { week: 2, avgRelevance: 90 },
      { week: 3, avgRelevance: 100 },
      { week: 4, avgRelevance: 90 },
      { week: 5, avgRelevance: 90 },
      { week: 6, avgRelevance: 90 },
    ]);

    // Hours from submitted entries only; week 1 has both interns.
    expect(r.hours.hasData).toBe(true);
    expect(r.hours.weeks[0]).toEqual({ week: 1, totalHours: 50, avgHours: 25 });
    expect(r.hours.weeks).toHaveLength(6);

    // Competencies ranked by frequency across activity tags. Python: 6, Testing: 2, SQL: 1.
    expect(r.skillProfile.hasData).toBe(true);
    expect(r.skillProfile.competencies[0]).toEqual({ tag: 'Python', count: 6, pct: 100 });
    expect(r.skillProfile.competencies.map(c => c.tag)).toEqual(['Python', 'Testing', 'SQL']);

    // Summaries grounded in the above.
    const titles = r.actionableSummaries.items.map(i => i.title);
    expect(r.actionableSummaries.hasData).toBe(true);
    expect(titles).toContain('Re-engage At-Risk Intern'); // Yaw
    expect(titles).toContain('Strong Logbook Signal');    // Akosua (90 ≥ 80)
    expect(titles).toContain('Cohort Focus');             // Python
  });

  it('handles entries with no AI assessment and filters blank competency tags', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        student: { firstName: 'Abena', lastName: 'Owusu' },
        company: null,
        logbookEntries: [
          entry(1, { submitted: true, hours: 20, tags: ['   ', 'Docker'], relevance: null }),
        ],
      },
    ]);

    const r = await getInsights({});

    // No assessment → relevanceScore null and the entry never enters the trend.
    expect(r.performanceMonitoring[0].relevanceScore).toBeNull();
    expect(r.relevanceTrend).toEqual([]);
    expect(r.performanceMonitoring[0].department).toBe('—'); // null company
    // Whitespace-only tag dropped; only Docker survives.
    expect(r.skillProfile.competencies).toEqual([{ tag: 'Docker', count: 1, pct: 100 }]);
    expect(r.hours.hasData).toBe(true);
  });

  it('returns an empty-but-valid shape when there are no placements', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);

    const r = await getInsights({ supervisorId: 'sup-1' });
    expect(r.overview.activeInterns).toBe(0);
    expect(r.performanceMonitoring).toEqual([]);
    expect(r.relevanceTrend).toEqual([]);
    expect(r.hours.hasData).toBe(false);
    expect(r.skillProfile.hasData).toBe(false);
    expect(r.actionableSummaries.hasData).toBe(false);
  });
});

describe('listInternsForFeedback', () => {
  const feedbackPlacements = [
    {
      id: 'p1',
      startDate: new Date('2026-01-05'),
      endDate:   new Date('2026-02-16'),
      academicYearId: 'ay-1',
      student: { id: 's1', firstName: 'Akosua', lastName: 'Mensah' },
      company: { name: 'Sankofa Software Ltd.' },
      logbookEntries: [
        // Newest first, as the query orders them. Week 6 is acknowledged and
        // week 5 is still awaiting the supervisor — the actionable one wins.
        { id: 'e-6', weekNumber: 6, status: 'acknowledged', submittedAt: new Date('2026-02-14'), assessments: [] },
        { id: 'e-5', weekNumber: 5, status: 'submitted',    submittedAt: new Date('2026-02-07'),
          assessments: [{
            quality:       { overall: 88 },
            summary:       { headline: 'Strong week.' },
            feedbackDraft: { text: 'Nice work on the API integration.' },
          }] },
      ],
    },
    {
      id: 'p2',
      startDate: new Date('2026-01-05'),
      endDate:   new Date('2026-02-16'),
      academicYearId: 'ay-1',
      student: { id: 's2', firstName: 'Yaa', lastName: 'Frimpong' },
      company: null,
      logbookEntries: [],
    },
  ];

  it('reads the consolidated logbook, not the retired submissions table', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue(feedbackPlacements);

    const r = await listInternsForFeedback({ supervisorId: 'sup-1' });

    expect(r[0].name).toBe('Akosua Mensah');
    // The week awaiting the supervisor is the one offered, not merely the newest.
    expect(r[0].latestEntry?.id).toBe('e-5');
    expect(r[0].latestEntry?.canReceiveFeedback).toBe(true);
    expect(r[0].latestEntry?.qualityScore).toBe(88);
    expect(r[0].latestEntry?.aiDraft).toEqual({ text: 'Nice work on the API integration.' });
    expect(r[0].progress.submittedWeeks).toBe(2);

    // An intern who has logged nothing has no week to act on — and says so,
    // rather than the whole cohort reading empty as it did off the dead table.
    expect(r[1].latestEntry).toBeNull();
  });

  it('falls back to the newest week when none is awaiting review', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([{
      ...feedbackPlacements[0],
      logbookEntries: [
        { id: 'e-6', weekNumber: 6, status: 'acknowledged', submittedAt: new Date('2026-02-14'), assessments: [] },
      ],
    }]);

    const r = await listInternsForFeedback({ supervisorId: 'sup-1' });

    expect(r[0].latestEntry?.id).toBe('e-6');
    expect(r[0].latestEntry?.canReceiveFeedback).toBe(false);
  });
});

jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement: {
      findMany: jest.fn(),
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

    // Yaw: 1/6 submitted → 17% engagement → flagged At Risk; relevance mean(40)=40.
    const yaw = r.performanceMonitoring.find(p => p.name === 'Yaw Asante')!;
    expect(yaw.engagementPct).toBe(17);
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
  it('returns interns with their latest submission + feedback eligibility', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        student: { id: 's1', firstName: 'Akosua', lastName: 'Mensah' },
        company: { name: 'Sankofa Software Ltd.' },
        logbookSubmissions: [
          { id: 'sub-9', weekNumber: 6, submissionStatus: 'submitted',
            analysis: { qualityScore: 88, sentimentClass: 'supportive', aiFeedbackSummary: 'Strong week.' } },
        ],
      },
      {
        id: 'p2',
        student: { id: 's2', firstName: 'Yaa', lastName: 'Frimpong' },
        company: null,
        logbookSubmissions: [],
      },
    ]);

    const r = await listInternsForFeedback({ supervisorId: 'sup-1' });

    expect(r[0].name).toBe('Akosua Mensah');
    expect(r[0].latestSubmission?.canReceiveFeedback).toBe(true);
    expect(r[0].latestSubmission?.aiFeedbackSummary).toBe('Strong week.');
    expect(r[1].latestSubmission).toBeNull();
  });
});

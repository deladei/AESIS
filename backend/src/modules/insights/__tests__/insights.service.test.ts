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

const sub = (
  weekNumber: number,
  submissionStatus: string,
  analysis: Record<string, unknown> | null = null,
) => ({ weekNumber, submissionStatus, analysis });

beforeEach(() => jest.clearAllMocks());

describe('getInsights', () => {
  it('aggregates performance, trend, sentiment, skills and summaries from real rows', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        student: { id: 's1', firstName: 'Akosua', lastName: 'Mensah' },
        company: { name: 'Sankofa Software Ltd.' },
        riskScores: [{ riskTier: 'low', riskScore: 0.1, topRiskFactors: [] }],
        logbookSubmissions: [
          sub(1, 'approved',  { qualityScore: 90, taskDepthScore: 80, techVocabScore: 70, reflectionScore: 60, temporalConsistencyScore: 88, sentimentPolarity: 0.5, sentimentClass: 'supportive' }),
          sub(2, 'submitted', { qualityScore: 96, taskDepthScore: 84, techVocabScore: 74, reflectionScore: 64, temporalConsistencyScore: 92, sentimentPolarity: 0.6, sentimentClass: 'encouraging' }),
        ],
      },
      {
        id: 'p2',
        student: { id: 's2', firstName: 'Yaa', lastName: 'Frimpong' },
        company: { name: 'Ananse Technologies Ltd.' },
        riskScores: [{ riskTier: 'high', riskScore: 0.8, topRiskFactors: ['missed deadlines'] }],
        logbookSubmissions: [
          sub(1, 'approved', { qualityScore: 50, taskDepthScore: 40, techVocabScore: 30, reflectionScore: 35, temporalConsistencyScore: 45, sentimentPolarity: -0.2, sentimentClass: 'frustrated' }),
          sub(2, 'draft',    null),
        ],
      },
    ]);

    const r = await getInsights({});

    expect(r.overview.activeInterns).toBe(2);
    expect(r.overview.flaggedCount).toBe(1);

    // Akosua: 2/2 submitted → 100% engagement, success = (1-0.1)*100 = 90, Active
    const akosua = r.performanceMonitoring.find(p => p.name === 'Akosua Mensah')!;
    expect(akosua.engagementPct).toBe(100);
    expect(akosua.successScore).toBe(90);
    expect(akosua.status).toBe('Active');

    // Yaa: high risk → flagged, success = (1-0.8)*100 = 20, 1/2 submitted = 50%
    const yaa = r.performanceMonitoring.find(p => p.name === 'Yaa Frimpong')!;
    expect(yaa.flagged).toBe(true);
    expect(yaa.status).toBe('Flagged');
    expect(yaa.successScore).toBe(20);
    expect(yaa.engagementPct).toBe(50);

    // Weekly trend: week1 avg (90,50)=70, week2 avg (96)=96
    expect(r.successTrend).toEqual([
      { week: 1, avgQuality: 70 },
      { week: 2, avgQuality: 96 },
    ]);

    // Sentiment present; week1 avg (0.5,-0.2)=0.2, week2 (0.6)=0.6 → no negative weeks
    expect(r.sentiment.hasData).toBe(true);
    expect(r.sentiment.anomalyWeek).toBeNull();

    // Skill profile has data for all 4 dimensions
    expect(r.skillProfile.hasData).toBe(true);
    expect(r.skillProfile.dimensions).toHaveLength(4);

    // Summaries: highest-risk mentorship (Yaa) + resource (weakest dim) + success signal (Akosua 90)
    expect(r.actionableSummaries.hasData).toBe(true);
    const titles = r.actionableSummaries.items.map(i => i.title);
    expect(titles).toContain('Targeted Mentorship');
    expect(titles).toContain('Success Signal');
  });

  it('flags an anomaly week when avg sentiment polarity is negative', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        student: { id: 's1', firstName: 'Kwabena', lastName: 'Boateng' },
        company: null,
        riskScores: [],
        logbookSubmissions: [
          sub(3, 'submitted', { qualityScore: 60, sentimentPolarity: -0.4, sentimentClass: 'frustrated' }),
        ],
      },
    ]);

    const r = await getInsights({});
    expect(r.sentiment.anomalyWeek).toBe(3);
    // no risk score → success falls back to avg quality (60)
    expect(r.performanceMonitoring[0].successScore).toBe(60);
  });

  it('returns empty-but-valid shape when there are no placements', async () => {
    (mp.placement.findMany as jest.Mock).mockResolvedValue([]);

    const r = await getInsights({ supervisorId: 'sup-1' });
    expect(r.overview.activeInterns).toBe(0);
    expect(r.performanceMonitoring).toEqual([]);
    expect(r.sentiment.hasData).toBe(false);
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

import { prisma } from '../../config/prisma';

/**
 * AI Insights & Analytics aggregation — all derived from real Postgres data.
 *
 * Scope:
 *   - supervisorId set  → only that supervisor's active placements
 *   - supervisorId null → all active placements (coordinator / admin)
 *
 * Panels that depend on data that may be sparse (sentiment, skill profile,
 * summaries) carry a `hasData` flag so the UI can fall back to a labelled
 * "Sample" view instead of rendering an empty/misleading panel.
 */

const SUBMITTED_STATUSES = ['submitted', 'approved', 'under_review'] as const;
const num = (v: unknown): number | null =>
  v == null ? null : Number(v);

const avg = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

export interface InsightsScope {
  supervisorId?: string;
}

export async function getInsights({ supervisorId }: InsightsScope) {
  const placements = await prisma.placement.findMany({
    where: {
      placementStatus: 'active',
      ...(supervisorId ? { academicSupervisorId: supervisorId } : {}),
    },
    select: {
      id:      true,
      student: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { name: true } },
      riskScores: {
        orderBy: { computedAt: 'desc' },
        take:    1,
        select:  { riskTier: true, riskScore: true, topRiskFactors: true },
      },
      logbookSubmissions: {
        orderBy: { weekNumber: 'asc' },
        select: {
          weekNumber:       true,
          submissionStatus: true,
          analysis: {
            select: {
              qualityScore:            true,
              taskDepthScore:          true,
              techVocabScore:          true,
              reflectionScore:         true,
              temporalConsistencyScore: true,
              sentimentClass:          true,
              sentimentPolarity:       true,
            },
          },
        },
      },
    },
  });

  // ── Per-intern performance rows ─────────────────────────────
  const performanceMonitoring = placements.map(p => {
    const subs        = p.logbookSubmissions;
    const submitted   = subs.filter(s => SUBMITTED_STATUSES.includes(s.submissionStatus as never));
    const expected    = subs.length;
    const quality     = submitted
      .map(s => num(s.analysis?.qualityScore))
      .filter((v): v is number => v !== null);
    const avgQuality  = avg(quality);
    const riskTier    = p.riskScores[0]?.riskTier ?? null;
    const riskScore   = num(p.riskScores[0]?.riskScore);

    const engagementPct = expected > 0 ? Math.round((submitted.length / expected) * 100) : 0;
    const successScore  = riskScore != null
      ? Math.round((1 - riskScore) * 100)
      : avgQuality != null ? Math.round(avgQuality) : null;

    const flagged = riskTier === 'high';
    const engagementLabel =
      flagged              ? 'At Risk'
      : engagementPct >= 80 ? 'High'
      : engagementPct >= 50 ? 'On Track'
      :                       'Low';

    return {
      placementId:   p.id,
      name:          `${p.student.firstName} ${p.student.lastName}`,
      department:    p.company?.name ?? '—',
      engagementPct,
      engagementLabel,
      submittedCount: submitted.length,
      expectedWeeks:  expected,
      successScore,
      riskTier,
      status:        flagged ? 'Flagged' : 'Active',
      flagged,
    };
  });

  // ── Weekly cohort quality trend (Hiring Success Probability) ─
  const byWeek = new Map<number, number[]>();
  for (const p of placements) {
    for (const s of p.logbookSubmissions) {
      const q = num(s.analysis?.qualityScore);
      if (q == null) continue;
      (byWeek.get(s.weekNumber) ?? byWeek.set(s.weekNumber, []).get(s.weekNumber)!).push(q);
    }
  }
  const successTrend = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, qs]) => ({ week, avgQuality: avg(qs)! }));

  // ── Weekly sentiment (avg polarity per week) ────────────────
  const sentByWeek = new Map<number, number[]>();
  for (const p of placements) {
    for (const s of p.logbookSubmissions) {
      const pol = num(s.analysis?.sentimentPolarity);
      if (pol == null) continue;
      (sentByWeek.get(s.weekNumber) ?? sentByWeek.set(s.weekNumber, []).get(s.weekNumber)!).push(pol);
    }
  }
  const sentimentWeeks = [...sentByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, ps]) => ({ week, polarity: avg(ps)! }));
  // first negative-polarity week, if any, is an anomaly
  const anomalyWeek = sentimentWeeks.find(w => w.polarity < 0)?.week ?? null;
  const sentiment = {
    hasData: sentimentWeeks.length > 0,
    weeks:   sentimentWeeks,
    anomalyWeek,
  };

  // ── Cohort skill profile (rubric sub-scores) ────────────────
  const dims: Record<string, number[]> = {
    'Task Depth': [], 'Technical Vocabulary': [], 'Reflection': [], 'Temporal Consistency': [],
  };
  for (const p of placements) {
    for (const s of p.logbookSubmissions) {
      const a = s.analysis;
      if (!a) continue;
      const td = num(a.taskDepthScore);          if (td != null) dims['Task Depth'].push(td);
      const tv = num(a.techVocabScore);           if (tv != null) dims['Technical Vocabulary'].push(tv);
      const rf = num(a.reflectionScore);          if (rf != null) dims['Reflection'].push(rf);
      const tc = num(a.temporalConsistencyScore); if (tc != null) dims['Temporal Consistency'].push(tc);
    }
  }
  const skillProfile = Object.entries(dims).map(([dimension, xs]) => ({
    dimension,
    avgScore: avg(xs),
  }));
  const skillHasData = skillProfile.some(s => s.avgScore != null);

  // ── Derived actionable summaries ────────────────────────────
  const summaries: { title: string; body: string }[] = [];

  const highest = [...placements]
    .map(p => ({ p, risk: num(p.riskScores[0]?.riskScore) }))
    .filter(x => x.risk != null)
    .sort((a, b) => b.risk! - a.risk!)[0];
  if (highest && highest.risk! >= 0.5) {
    const factor = highest.p.riskScores[0]?.topRiskFactors?.[0];
    summaries.push({
      title: 'Targeted Mentorship',
      body:  `Schedule a 1-on-1 with ${highest.p.student.firstName} ${highest.p.student.lastName}. `
           + `They are the highest-risk intern${factor ? ` — top factor: ${factor}.` : '.'}`,
    });
  }

  const weakest = [...skillProfile]
    .filter(s => s.avgScore != null)
    .sort((a, b) => a.avgScore! - b.avgScore!)[0];
  if (weakest) {
    summaries.push({
      title: 'Resource Assignment',
      body:  `Cohort ${weakest.dimension} averages ${weakest.avgScore}/100 — the weakest rubric dimension. `
           + `Consider a targeted resource to lift it.`,
    });
  }

  const topPerf = [...performanceMonitoring]
    .filter(r => r.successScore != null && !r.flagged)
    .sort((a, b) => b.successScore! - a.successScore!)[0];
  if (topPerf && topPerf.successScore! >= 85) {
    summaries.push({
      title: 'Success Signal',
      body:  `${topPerf.name} leads the cohort at ${topPerf.successScore}/100 success score. `
           + `Recommended for early recognition.`,
    });
  }

  return {
    overview: {
      activeInterns: placements.length,
      flaggedCount:  performanceMonitoring.filter(r => r.flagged).length,
    },
    performanceMonitoring,
    successTrend,
    sentiment,
    skillProfile:    { hasData: skillHasData, dimensions: skillProfile },
    actionableSummaries: { hasData: summaries.length > 0, items: summaries },
  };
}

/**
 * Interns + their latest reviewable submission, for the Feedback Center
 * intern picker / AI feedback generator. Same scope rules as getInsights.
 */
export async function listInternsForFeedback({ supervisorId }: InsightsScope) {
  const placements = await prisma.placement.findMany({
    where: {
      placementStatus: 'active',
      ...(supervisorId ? { academicSupervisorId: supervisorId } : {}),
    },
    select: {
      id:      true,
      student: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { name: true } },
      logbookSubmissions: {
        orderBy: { weekNumber: 'desc' },
        take:    1,
        select: {
          id:               true,
          weekNumber:       true,
          submissionStatus: true,
          analysis: {
            select: {
              qualityScore:      true,
              sentimentClass:    true,
              aiFeedbackSummary: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return placements.map(p => {
    const s = p.logbookSubmissions[0];
    return {
      placementId: p.id,
      studentId:   p.student.id,
      name:        `${p.student.firstName} ${p.student.lastName}`,
      company:     p.company?.name ?? null,
      latestSubmission: s
        ? {
            id:                s.id,
            weekNumber:        s.weekNumber,
            status:            s.submissionStatus,
            canReceiveFeedback: ['submitted', 'under_review'].includes(s.submissionStatus),
            qualityScore:      num(s.analysis?.qualityScore),
            sentimentClass:    s.analysis?.sentimentClass ?? null,
            aiFeedbackSummary: s.analysis?.aiFeedbackSummary ?? null,
          }
        : null,
    };
  });
}

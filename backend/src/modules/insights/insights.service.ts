import { prisma } from '../../config/prisma';
import {
  meanQualityScore, toQualityNumber, weeksDue, engagementPercent, v2QualityOverall,
} from '../../shared/utils/quality';
import { durationWeeksByAcademicYear, weeksForYear } from '../entries/entries.week';

/**
 * AI Insights & Analytics aggregation — derived from the ACTIVE weekly-entries
 * pipeline (`logbook_entry` + `entry_activity` + advisory `ai_assessment`),
 * which is the system of record for current student activity. The legacy
 * `logbook_submissions`/`logbook_analyses` tables are intentionally NOT read
 * here — they hold no current data (see HANDOFF S39: the half-migration).
 *
 * Scope:
 *   - supervisorId set  → only that supervisor's active placements
 *   - supervisorId null → all active placements (coordinator / admin)
 *
 * HARD RULE: `ai_assessment.relevance` is an advisory signal and is surfaced as
 * "AI relevance", never as a grade or quality score. Every numeric is validated
 * via the shared quality helpers so a panel can never render an impossible
 * value; panels with no source data carry a `hasData` flag (UI shows an honest
 * empty state, never fabricated "sample" data).
 */

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const round1 = (n: number): number => Math.round(n * 10) / 10;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

// Below this % of expected weeks submitted, an intern is flagged at-risk.
const ENGAGEMENT_AT_RISK = 50;

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
      academicYearId: true,
      startDate: true,
      student: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
      logbookEntries: {
        orderBy: { weekNumber: 'asc' },
        select: {
          weekNumber:  true,
          submittedAt: true,
          hoursLogged: true,
          activities:  { select: { competencyTags: true } },
          assessments: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { relevance: true },
          },
        },
      },
    },
  });

  // How long each intern's programme actually runs. One query for the whole
  // page — the length is per cohort, not per placement.
  const weeksByYear = await durationWeeksByAcademicYear(placements.map((p) => p.academicYearId));

  type Entry = (typeof placements)[number]['logbookEntries'][number];

  // Latest advisory AI relevance for an entry, scaled 0–1 → 0–100, or null.
  const entryRelevance = (e: Entry): number | null => {
    const r = toQualityNumber(e.assessments[0]?.relevance);
    return r == null ? null : r * 100;
  };

  // ── Per-intern performance ──────────────────────────────────
  const performanceMonitoring = placements.map(p => {
    const submitted      = p.logbookEntries.filter(e => e.submittedAt != null);
    const submittedCount = submitted.length;
    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    // What they owe SO FAR, not the whole programme — see weeksDue.
    const due            = weeksDue(p.startDate, programmeWeeks);
    const engagementPct  = engagementPercent(submittedCount, due);
    // meanQualityScore drops null/out-of-range and clamps to [0,100] → null when none.
    const relevanceScore = meanQualityScore(submitted.map(entryRelevance));

    // Too early to judge is not the same as doing badly.
    const flagged = engagementPct != null && engagementPct < ENGAGEMENT_AT_RISK;
    const engagementLabel = engagementPct == null ? 'Too early'
      : flagged ? 'At Risk' : engagementPct >= 80 ? 'High' : 'On Track';

    return {
      placementId:    p.id,
      name:           `${p.student.firstName} ${p.student.lastName}`,
      department:     p.company?.name ?? '—',
      engagementPct,
      engagementLabel,
      submittedCount,
      weeksDue:       due,
      programmeWeeks,
      relevanceScore,
      status:         engagementPct == null ? 'Too early' : flagged ? 'At Risk' : 'On Track',
      flagged,
    };
  });

  // ── Weekly AI relevance trend (advisory) ────────────────────
  const relByWeek = new Map<number, number[]>();
  for (const p of placements) {
    for (const e of p.logbookEntries) {
      const r = entryRelevance(e);
      if (r == null) continue;
      (relByWeek.get(e.weekNumber) ?? relByWeek.set(e.weekNumber, []).get(e.weekNumber)!).push(r);
    }
  }
  const relevanceTrend = [...relByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, rs]) => ({ week, avgRelevance: meanQualityScore(rs)! }));

  // ── Weekly hours logged (replaces legacy sentiment heatmap) ─
  const hoursByWeek = new Map<number, number[]>();
  for (const p of placements) {
    for (const e of p.logbookEntries) {
      if (e.submittedAt == null) continue;
      const h = num(e.hoursLogged);
      if (h == null || h < 0) continue;
      (hoursByWeek.get(e.weekNumber) ?? hoursByWeek.set(e.weekNumber, []).get(e.weekNumber)!).push(h);
    }
  }
  const hoursWeeks = [...hoursByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, hs]) => ({
      week,
      totalHours: round1(sum(hs)),
      avgHours:   round1(sum(hs) / hs.length),
    }));
  const hours = { hasData: hoursWeeks.length > 0, weeks: hoursWeeks };

  // ── Cohort competencies (from real activity tags) ───────────
  const tagCounts = new Map<string, number>();
  for (const p of placements) {
    for (const e of p.logbookEntries) {
      for (const a of e.activities) {
        for (const tag of a.competencyTags) {
          const t = tag.trim();
          if (!t) continue;
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
      }
    }
  }
  const ranked   = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = ranked[0]?.[1] ?? 0;
  const competencies = ranked.map(([tag, count]) => ({
    tag,
    count,
    pct: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
  }));
  const skillProfile = { hasData: competencies.length > 0, competencies };

  // ── Derived actionable summaries (all grounded in the above) ─
  const summaries: { title: string; body: string }[] = [];

  const lowest = [...performanceMonitoring]
    .filter((r): r is typeof r & { engagementPct: number } => r.flagged && r.engagementPct != null)
    .sort((a, b) => a.engagementPct - b.engagementPct)[0];
  if (lowest) {
    summaries.push({
      title: 'Re-engage At-Risk Intern',
      body:  `${lowest.name} has submitted ${lowest.submittedCount} of the ${lowest.weeksDue} week`
           + `${lowest.weeksDue === 1 ? '' : 's'} due so far `
           + `(${lowest.engagementPct}% engagement, week ${lowest.weeksDue} of ${lowest.programmeWeeks}). `
           + `Schedule a check-in.`,
    });
  }

  const topRel = [...performanceMonitoring]
    .filter(r => r.relevanceScore != null && !r.flagged)
    .sort((a, b) => b.relevanceScore! - a.relevanceScore!)[0];
  if (topRel && topRel.relevanceScore! >= 80) {
    summaries.push({
      title: 'Strong Logbook Signal',
      body:  `${topRel.name} leads on advisory AI relevance (${topRel.relevanceScore}/100) across submitted entries.`,
    });
  }

  if (competencies.length > 0) {
    summaries.push({
      title: 'Cohort Focus',
      body:  `Most-practised competency this cohort: “${competencies[0].tag}” (${competencies[0].count} logged activities).`,
    });
  }

  return {
    overview: {
      activeInterns: placements.length,
      flaggedCount:  performanceMonitoring.filter(r => r.flagged).length,
    },
    performanceMonitoring,
    relevanceTrend,
    hours,
    skillProfile,
    actionableSummaries: { hasData: summaries.length > 0, items: summaries },
  };
}

/**
 * Interns + their latest week, for the Feedback Centre's picker and evaluator.
 *
 * Reads the CONSOLIDATED logbook (`logbook_entry`), not the retired
 * `logbook_submissions` table it used to read — on the current pipeline that
 * query returned nothing for every intern, so the Feedback Centre told every
 * supervisor their whole cohort had never submitted anything. Same scope rules
 * as getInsights.
 *
 * The AI fields are advisory and pass through untouched: the draft is a
 * starting point for a human to edit, never something sent on its own.
 */
export async function listInternsForFeedback({ supervisorId }: InsightsScope) {
  const placements = await prisma.placement.findMany({
    where: {
      placementStatus: 'active',
      ...(supervisorId ? { academicSupervisorId: supervisorId } : {}),
    },
    select: {
      id:        true,
      startDate: true,
      endDate:   true,
      academicYearId: true,
      student: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { name: true } },
      logbookEntries: {
        orderBy: { weekNumber: 'desc' },
        select: {
          id:          true,
          weekNumber:  true,
          status:      true,
          submittedAt: true,
          assessments: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { quality: true, summary: true, feedbackDraft: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const weeksByYear = await durationWeeksByAcademicYear(placements.map(p => p.academicYearId));

  return placements.map(p => {
    // The latest week the supervisor could act on is the newest SUBMITTED one;
    // if none is awaiting them, fall back to the newest week of any status so
    // the panel still shows where the intern is.
    const submitted = p.logbookEntries.filter(e => e.status === 'submitted');
    const latest    = submitted[0] ?? p.logbookEntries[0] ?? null;
    const assessment = latest?.assessments?.[0];

    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    const due            = weeksDue(p.startDate, programmeWeeks);
    const submittedCount = p.logbookEntries.filter(e => e.submittedAt != null).length;

    return {
      placementId: p.id,
      studentId:   p.student.id,
      name:        `${p.student.firstName} ${p.student.lastName}`,
      company:     p.company?.name ?? null,
      progress: {
        submittedWeeks: submittedCount,
        weeksDue:       due,
        programmeWeeks,
        // Against weeks DUE, so an intern in week 3 of 24 is not "12% done".
        pct: engagementPercent(submittedCount, due),
      },
      latestEntry: latest
        ? {
            id:                 latest.id,
            weekNumber:         latest.weekNumber,
            status:             latest.status,
            submittedAt:        latest.submittedAt,
            // Only a submitted week can be acknowledged or returned.
            canReceiveFeedback: latest.status === 'submitted',
            qualityScore:       v2QualityOverall(assessment?.quality),
            quality:            assessment?.quality ?? null,
            aiSummary:          assessment?.summary ?? null,
            aiDraft:            assessment?.feedbackDraft ?? null,
          }
        : null,
    };
  });
}

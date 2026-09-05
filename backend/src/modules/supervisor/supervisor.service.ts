import { prisma } from '../../config/prisma';
import { refreshRiskSnapshots } from '../risk/risk.service';
import { meanQualityScore, mergedQualityScores, weeksDue, engagementPercent } from '../../shared/utils/quality';
import { durationWeeksByAcademicYear, weeksForYear } from '../entries/entries.week';

export async function getSupervisorDashboard(supervisorId: string) {
  // Bring risk tiers up to date before reading them (never throws).
  await refreshRiskSnapshots(supervisorId);

  const [placements, pendingReview] = await Promise.all([
    prisma.placement.findMany({
      where: {
        academicSupervisorId: supervisorId,
        placementStatus:      'active',
      },
      select: {
        id:      true,
        startDate:          true,
        academicYearId:     true,
        finalizationStatus: true,
        company: { select: { name: true } },
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        riskScores: {
          orderBy: { computedAt: 'desc' },
          take:    1,
          select:  { riskTier: true, riskScore: true, topRiskFactors: true },
        },
        // The LIVE pipeline. `recentWeeks` and `lastSubmittedAt` used to be read
        // off `logbook_submissions`, which has had no writer since the
        // consolidation — so every student row said "no submissions yet"
        // however many weeks they had actually sent in.
        logbookEntries: {
          orderBy: { weekNumber: 'desc' },
          take:    4,
          select: {
            weekNumber:  true,
            status:      true,
            submittedAt: true,
            assessments: { select: { quality: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        // Legacy analyses are frozen history — no writer since S82 — but they
        // are still the ONLY quality figure older cohorts have, so they stay in
        // the average. They are deliberately NOT used for recentWeeks or
        // lastSubmittedAt any more: that is what made every row read empty.
        logbookSubmissions: {
          orderBy: { weekNumber: 'desc' },
          take:    4,
          select:  { analysis: { select: { qualityScore: true } } },
        },
        _count: {
          select: { logbookEntries: { where: { submittedAt: { not: null } } } },
        },
      },
    }),
    // The ACTIVE pipeline. This counted `logbook_submissions`, which has had no
    // writer since the consolidation — so "Pending Reviews" read 0 in
    // production however many weeks were actually waiting on the supervisor.
    prisma.logbookEntry.count({
      where: {
        placement: {
          academicSupervisorId: supervisorId,
          placementStatus:      'active',
        },
        status: 'submitted',
      },
    }),
  ]);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [reportsThisMonth, completedInternships, upcomingReviews, pendingApprovals] = await Promise.all([
    prisma.logbookEntry.count({
      where: {
        placement: { academicSupervisorId: supervisorId },
        submittedAt: { gte: monthStart },
      },
    }),
    prisma.placement.count({
      where: { academicSupervisorId: supervisorId, finalizationStatus: 'finalized' },
    }),
    prisma.visitSchedule.findMany({
      where: {
        supervisorId,
        cancelledAt: null,
        completed: false,
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      select: {
        id: true, scheduledAt: true, visitType: true, durationMinutes: true, location: true,
        placement: {
          select: {
            id: true,
            student: { select: { firstName: true, lastName: true } },
            company: { select: { name: true } },
          },
        },
      },
    }),
    prisma.approvalRequest.count({
      where: { status: 'requested', placement: { academicSupervisorId: supervisorId } },
    }),
  ]);

  // Programme length per cohort, one query for the whole page.
  const weeksByYear = await durationWeeksByAcademicYear(placements.map(p => p.academicYearId));

  const students = placements.map(p => {
    // Oldest-first for the sparkline.
    const recent = [...p.logbookEntries].reverse();

    // Validated mean over both sources: frozen legacy analyses + the live
    // entries' latest AI assessment. Clamped, with nulls excluded from both
    // numerator and denominator.
    const avgQualityScore = meanQualityScore(mergedQualityScores(
      p.logbookSubmissions.map(sub => sub.analysis?.qualityScore ?? null),
      p.logbookEntries,
    ));

    // Progress is submitted weeks over weeks actually DUE, not over the whole
    // programme — otherwise everyone reads "behind" until their final week.
    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    const due = weeksDue(p.startDate, programmeWeeks);
    const submittedWeeks = p._count.logbookEntries;

    return {
      placementId: p.id,
      student:     p.student,
      company:     p.company?.name ?? null,
      finalizationStatus: p.finalizationStatus,
      riskTier:    p.riskScores[0]?.riskTier  ?? null,
      riskScore:   p.riskScores[0]?.riskScore != null
                     ? Number(p.riskScores[0].riskScore) : null,
      riskFactors: p.riskScores[0]?.topRiskFactors ?? [],
      recentWeeks: recent.map(e => ({
        week:   e.weekNumber,
        status: e.status,
        score:  null as number | null,
      })),
      avgQualityScore,
      submittedWeeks,
      weeksDue: due,
      programmeWeeks,
      progressPct: engagementPercent(submittedWeeks, due),
      lastSubmittedAt: p.logbookEntries.find(e => e.submittedAt != null)?.submittedAt ?? null,
    };
  });

  const allAvgScores = students
    .map(s => s.avgQualityScore)
    .filter((v): v is number => v !== null);

  const avgQualityScore = allAvgScores.length
    ? Math.round(allAvgScores.reduce((a, b) => a + b, 0) / allAvgScores.length * 10) / 10
    : null;

  // The donut's centre figure: mean progress across students who actually have
  // weeks due. Students with nothing due yet are excluded from BOTH halves
  // rather than counted as 0%, which would drag the cohort down for no reason.
  const progressValues = students
    .map(s => s.progressPct)
    .filter((v): v is number => v !== null);
  const avgProgress = progressValues.length
    ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
    : null;

  // The next scheduled review per placement, so the student list can carry a
  // "Next review" column without a query per row.
  const nextReviewByPlacement: Record<string, string> = {};
  for (const v of upcomingReviews) {
    if (!nextReviewByPlacement[v.placement.id]) {
      nextReviewByPlacement[v.placement.id] = v.scheduledAt.toISOString();
    }
  }

  return {
    overview: {
      assignedStudents: placements.length,
      pendingReview,
      avgQualityScore,
      reportsThisMonth,
      completedInternships,
      pendingApprovals,
      avgProgress,
    },
    upcomingReviews: upcomingReviews.map((v) => ({
      id: v.id,
      scheduledAt: v.scheduledAt,
      visitType: v.visitType,
      durationMinutes: v.durationMinutes,
      location: v.location,
      placementId: v.placement.id,
      student: `${v.placement.student.firstName} ${v.placement.student.lastName}`,
      company: v.placement.company?.name ?? null,
    })),
    students: students.map((s) => ({
      ...s,
      nextReviewAt: nextReviewByPlacement[s.placementId] ?? null,
    })),
  };
}

import { prisma } from '../../config/prisma';
import {
  weeksDue, engagementPercent, meanQualityScore, mergedQualityScores,
} from '../../shared/utils/quality';
import { durationWeeksByAcademicYear, weeksForYear } from '../entries/entries.week';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import { sendEmail } from '../../shared/utils/email';
import { refreshRiskSnapshots } from '../risk/risk.service';
import { describeFailure } from '../../shared/utils/describeFailure';

// Engagement is measured off the active weekly-entry pipeline. A week "counts as
// submitted" once its entry has actually been submitted (submittedAt set);
// "pending" is awaiting supervisor action, "reviewed" is acted on.
const REVIEWED_ENTRY_STATUSES = ['acknowledged', 'returned'] as const;

const PULSE_LIMIT  = 6;
const RECENT_LIMIT = 6;
const ACTIVITY_LIMIT = 6;
// Six points is what the trend chart plots; more would compress the recent
// weeks, which are the ones anyone is actually looking at.
const TREND_WEEKS  = 6;

/**
 * Headline counts for the All Interns board.
 *
 * Every intern is counted once, in exactly one lifecycle bucket, off CURRENT
 * placements — a superseded placement from a transfer is history, not a second
 * intern. "Not started" and "in progress" are told apart by whether the student
 * has actually submitted a week, not by a status column that can sit at
 * `active` for someone who has never logged anything.
 */
export async function getInternStats() {
  await refreshRiskSnapshots();

  const placements = await prisma.placement.findMany({
    where:  { isCurrent: true },
    select: {
      id: true,
      placementStatus:    true,
      finalizationStatus: true,
      logbookEntries: {
        select: {
          submittedAt: true,
          assessments: {
            orderBy: { createdAt: 'desc' },
            take:    1,
            select:  { quality: true },
          },
        },
      },
      logbookSubmissions: { select: { analysis: { select: { qualityScore: true } } } },
      riskScores: {
        orderBy: { computedAt: 'desc' },
        take:    1,
        select:  { riskTier: true },
      },
    },
  });

  let notStarted = 0;
  let inProgress = 0;
  let completed  = 0;
  let atRisk     = 0;
  const scores: (number | null)[] = [];

  for (const p of placements) {
    const hasSubmitted = p.logbookEntries.some(e => e.submittedAt != null);
    const isDone = p.placementStatus === 'completed' || p.finalizationStatus === 'finalized';

    if (isDone) completed++;
    else if (hasSubmitted) inProgress++;
    else notStarted++;

    if (p.riskScores[0]?.riskTier === 'high') atRisk++;

    scores.push(...mergedQualityScores(
      p.logbookSubmissions.map(s => s.analysis?.qualityScore),
      p.logbookEntries,
    ));
  }

  return {
    total: placements.length,
    notStarted,
    inProgress,
    completed,
    atRisk,
    // Null when nothing anywhere has been scored — never 0, which would read as
    // a cohort of failures rather than a cohort nobody has assessed yet.
    avgScore: meanQualityScore(scores),
  };
}

/**
 * System-wide rollup for the Admin "Supervisor Overview" dashboard.
 * Admin sees all placements (no per-supervisor scoping).
 */
export async function getAdminDashboard() {
  // Bring risk tiers up to date before reading them (never throws).
  await refreshRiskSnapshots();

  const [
    activeInterns,
    totalSubmitted,
    pendingReviews,
    reviewedCount,
    activePlacements,
    recentRows,
  ] = await Promise.all([
    prisma.placement.count({ where: { placementStatus: 'active' } }),
    prisma.logbookEntry.count({
      where: { placement: { placementStatus: 'active' }, submittedAt: { not: null } },
    }),
    prisma.logbookEntry.count({ where: { status: 'submitted' } }),
    prisma.logbookEntry.count({ where: { status: { in: [...REVIEWED_ENTRY_STATUSES] } } }),
    prisma.placement.findMany({
      where:  { placementStatus: 'active' },
      select: {
        id:      true,
        academicYearId: true,
        startDate: true,
        student: {
          select: {
            firstName: true, lastName: true,
            programme: { select: { name: true } },
          },
        },
        riskScores: {
          orderBy: { computedAt: 'desc' },
          take: 1,
          select: { riskTier: true, topRiskFactors: true },
        },
      },
    }),
    prisma.logbookEntry.findMany({
      where:   { submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take:    RECENT_LIMIT,
      select:  {
        id: true, weekNumber: true, submittedAt: true, status: true,
        placement: { select: { student: { select: { firstName: true, lastName: true } } } },
      },
    }),
  ]);

  // Programme length is per cohort (CohortConfig.durationWeeks), not a literal:
  // interns × 6 told a 24-week cohort it had finished four times over.
  const weeksByYear = await durationWeeksByAcademicYear(
    activePlacements.map((p) => p.academicYearId),
  );
  // And the scheduled total is what has come DUE so far, not the whole
  // programme — otherwise every cohort reads badly until its final week.
  const dueByPlacement = new Map(
    activePlacements.map((p) => [
      p.id,
      weeksDue(p.startDate, weeksForYear(weeksByYear, p.academicYearId)),
    ]),
  );
  const totalScheduled = [...dueByPlacement.values()].reduce((a, b) => a + b, 0);
  // Nothing due yet across the cohort is not 100% engagement — it is no answer.
  const avgEngagement = engagementPercent(totalSubmitted, totalScheduled);

  // Submitted-week counts per active placement, in one grouped query.
  const placementIds = activePlacements.map(p => p.id);
  const submittedByPlacement = placementIds.length
    ? await prisma.logbookEntry.groupBy({
        by:     ['placementId'],
        _count: { _all: true },
        where:  { placementId: { in: placementIds }, submittedAt: { not: null } },
      })
    : [];
  const submittedMap = new Map(submittedByPlacement.map(r => [r.placementId, r._count._all]));

  const ranked = activePlacements.map(p => {
    const programmeWeeks = weeksForYear(weeksByYear, p.academicYearId);
    const due            = dueByPlacement.get(p.id) ?? 0;
    const submittedWeeks = submittedMap.get(p.id) ?? 0;
    return {
      placementId:   p.id,
      name:          `${p.student.firstName} ${p.student.lastName}`,
      department:    p.student.programme?.name ?? null,
      riskTier:      p.riskScores[0]?.riskTier ?? null,
      riskFactors:   p.riskScores[0]?.topRiskFactors ?? [],
      submittedWeeks,
      weeksDue:      due,
      programmeWeeks,
      engagementPct: engagementPercent(submittedWeeks, due),
      feedbackCount: 0,
    };
  }).sort((a, b) => (b.engagementPct ?? -1) - (a.engagementPct ?? -1));

  const pulseBoard = ranked.slice(0, PULSE_LIMIT);

  // Real at-risk list for the AI Alerts panel — every active intern whose
  // latest snapshot is high, worst engagement first.
  const riskAlerts = ranked
    .filter(p => p.riskTier === 'high')
    // Nothing due yet sorts last: it is an absence of evidence, not a bad score.
    .sort((a, b) => (a.engagementPct ?? 101) - (b.engagementPct ?? 101))
    .map(p => ({
      placementId: p.placementId,
      name:        p.name,
      factors:     p.riskFactors,
    }));

  // Feedback counts for just the surfaced interns — one query, tallied in JS.
  const topIds = pulseBoard.map(p => p.placementId);
  if (topIds.length) {
    const fbRows = await prisma.supervisorFeedback.findMany({
      where:  { submission: { placementId: { in: topIds } } },
      select: { submission: { select: { placementId: true } } },
    });
    const fbMap = new Map<string, number>();
    for (const r of fbRows) {
      const pid = r.submission.placementId;
      fbMap.set(pid, (fbMap.get(pid) ?? 0) + 1);
    }
    for (const p of pulseBoard) p.feedbackCount = fbMap.get(p.placementId) ?? 0;
  }

  // ── Six-week trend ────────────────────────────────────────
  //
  // Submission rate and mean writing quality per week number, across every
  // active placement. Both are honest nulls where there is nothing to average:
  // a week nobody has reached yet is not 0% engagement and not a quality score
  // of zero, and drawing either as a point on a line says something false.
  const trend = await buildWeeklyTrend(placementIds, dueByPlacement);

  // ── Week states ───────────────────────────────────────────
  const statusRows = placementIds.length
    ? await prisma.logbookEntry.groupBy({
        by:     ['status'],
        _count: { _all: true },
        where:  { placementId: { in: placementIds } },
      })
    : [];
  const statusMix = {
    draft:        0,
    submitted:    0,
    acknowledged: 0,
    returned:     0,
  };
  for (const r of statusRows) {
    if (r.status in statusMix) statusMix[r.status as keyof typeof statusMix] = r._count._all;
  }

  // ── Progress by programme ─────────────────────────────────
  //
  // Aggregated from the same per-placement figures the pulse board uses, so the
  // bars and the cards cannot disagree. A programme where nothing is due yet is
  // omitted rather than drawn at 0%.
  const byProgramme = new Map<string, { submitted: number; due: number }>();
  for (const p of ranked) {
    const key = p.department ?? 'Unassigned programme';
    const acc = byProgramme.get(key) ?? { submitted: 0, due: 0 };
    acc.submitted += p.submittedWeeks;
    acc.due       += p.weeksDue;
    byProgramme.set(key, acc);
  }
  const programmeProgress = [...byProgramme.entries()]
    .map(([programme, v]) => ({ programme, pct: engagementPercent(v.submitted, v.due) }))
    .filter((r): r is { programme: string; pct: number } => r.pct !== null)
    .sort((a, b) => b.pct - a.pct);

  // ── Recent activity ───────────────────────────────────────
  //
  // Straight off the append-only entry_event log, which is the only record of
  // what actually happened rather than what the tables currently say.
  const activityRows = await prisma.entryEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take:    ACTIVITY_LIMIT,
    select: {
      id: true, eventType: true, toStatus: true, createdAt: true, actorRole: true,
      actor: { select: { firstName: true, lastName: true } },
      entry: { select: { weekNumber: true } },
    },
  });
  const recentActivity = activityRows.map(e => ({
    id:        e.id,
    eventType: e.eventType,
    toStatus:  e.toStatus,
    actorName: `${e.actor.firstName} ${e.actor.lastName}`.trim(),
    actorRole: e.actorRole,
    weekNumber: e.entry.weekNumber,
    at:        e.createdAt,
  }));

  // Placements that started in the last seven days — the "+N this week" delta.
  // A real count, not a trend line: there is no historical series behind it.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const newInternsThisWeek = await prisma.placement.count({
    where: { placementStatus: 'active', createdAt: { gte: since } },
  });

  const recentSubmissions = recentRows.map(s => ({
    id:          s.id,
    internName:  `${s.placement.student.firstName} ${s.placement.student.lastName}`,
    weekNumber:  s.weekNumber,
    submittedAt: s.submittedAt,
    status:      s.status,
  }));

  return {
    overview: {
      activeInterns,
      pendingReviews,
      avgEngagement,
      newInternsThisWeek,
      activeProgrammes: byProgramme.size,
    },
    pulseBoard,
    riskAlerts,
    recentSubmissions,
    submissionCounts:  { pending: pendingReviews, reviewed: reviewedCount },
    trend,
    statusMix,
    programmeProgress,
    recentActivity,
  };
}

/**
 * Submission rate and mean writing quality for the last `TREND_WEEKS` week
 * numbers that have actually come due.
 *
 * The denominator is how many placements had reached that week, not how many
 * exist — otherwise week 6 reads as a collapse in engagement purely because
 * most of the cohort has not got there yet.
 */
async function buildWeeklyTrend(
  placementIds: string[],
  dueByPlacement: Map<string, number>,
) {
  const maxDue = Math.max(0, ...dueByPlacement.values());
  if (!placementIds.length || maxDue === 0) return [];

  const first = Math.max(1, maxDue - TREND_WEEKS + 1);
  const weekNumbers = Array.from({ length: maxDue - first + 1 }, (_, i) => first + i);

  const entries = await prisma.logbookEntry.findMany({
    where:  { placementId: { in: placementIds }, weekNumber: { in: weekNumbers } },
    select: {
      weekNumber: true,
      submittedAt: true,
      assessments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { quality: true },
      },
    },
  });

  return weekNumbers.map(weekNumber => {
    // How many placements had this week due at all.
    let due = 0;
    for (const d of dueByPlacement.values()) if (d >= weekNumber) due += 1;

    const forWeek = entries.filter(e => e.weekNumber === weekNumber);
    const submitted = forWeek.filter(e => e.submittedAt !== null).length;

    const scores = forWeek
      .map(e => (e.assessments[0]?.quality as { overall?: unknown } | null)?.overall)
      .map(v => clampQuality(v))
      .filter((v): v is number => v !== null);

    return {
      weekNumber,
      submissionRate: engagementPercent(submitted, due),
      // Advisory only, and null rather than 0 when nothing was scored — a week
      // with no assessments is not a week that scored badly.
      avgQuality: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
    };
  });
}

/** AI quality is untrusted input even on the way out of our own table. */
function clampQuality(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

// ── Admin ↔ intern messaging + scheduled calls ────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

async function loadInternForMessaging(placementId: string) {
  const p = await prisma.placement.findUnique({
    where: { id: placementId },
    select: { studentId: true, student: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!p) throw new AppError(404, 'Placement not found');
  return p;
}

/** Active interns the admin can message (admin is the superuser — sees all). */
export async function listMessageableInterns() {
  const placements = await prisma.placement.findMany({
    where: { placementStatus: 'active' },
    select: {
      id: true,
      student: { select: { firstName: true, lastName: true, email: true } },
      company: { select: { name: true } },
    },
    orderBy: [{ student: { firstName: 'asc' } }],
  });
  return placements.map((p) => ({
    placementId: p.id,
    name: `${p.student.firstName} ${p.student.lastName}`,
    email: p.student.email,
    company: p.company?.name ?? null,
  }));
}

/**
 * Free-text message from the admin to an intern: an in-app notification AND an
 * email to their registered address. Email send is best-effort (logged, never
 * fails the message) — the in-app notification is the system of record.
 */
export async function messageIntern(placementId: string, body: string) {
  const p = await loadInternForMessaging(placementId);
  await createNotification({
    userId: p.studentId,
    type: 'system',
    title: 'Message from the admin team',
    body,
    link: '/student/notifications',
  });
  await sendEmail({
    to: p.student.email,
    subject: 'AESIS — Message from the admin team',
    html: `<p>Hi ${escapeHtml(p.student.firstName)},</p><p>${escapeHtml(body)}</p><p>— AESIS Admin</p>`,
  });
  return { ok: true, emailedTo: p.student.email };
}

export interface ScheduleCallInput {
  scheduledAt: string; // ISO datetime
  topic: string;
  meetLink: string;    // Google Meet URL the admin created
}

/**
 * Schedule a video call with an intern: emails them the Google Meet link + time
 * (registered address) and drops an in-app notification linking straight to the
 * meeting. The Meet room is created by the admin (meet.google.com) and pasted —
 * the system just delivers it.
 */
export async function scheduleCallWithIntern(placementId: string, input: ScheduleCallInput) {
  const p = await loadInternForMessaging(placementId);
  const when = new Date(input.scheduledAt);
  const whenStr = when.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

  await createNotification({
    userId: p.studentId,
    type: 'system',
    title: 'Video call scheduled',
    body: `${input.topic} — ${whenStr}. Tap to join the Google Meet.`,
    link: input.meetLink,
    metadata: { scheduledAt: input.scheduledAt, meetLink: input.meetLink, topic: input.topic },
  });
  await sendEmail({
    to: p.student.email,
    subject: `AESIS — Video call scheduled: ${input.topic}`,
    html:
      `<p>Hi ${escapeHtml(p.student.firstName)},</p>` +
      `<p>A video call has been scheduled with you:</p>` +
      `<p><strong>Topic:</strong> ${escapeHtml(input.topic)}<br/>` +
      `<strong>When:</strong> ${escapeHtml(whenStr)}</p>` +
      `<p><a href="${escapeHtml(input.meetLink)}">Join the Google Meet</a><br/>` +
      `<span>${escapeHtml(input.meetLink)}</span></p>` +
      `<p>— AESIS Admin</p>`,
  });
  return { ok: true, emailedTo: p.student.email };
}

/**
 * The admin dashboard's read, with its exception reported rather than thrown.
 * Same reasoning as the coordinator's: a generic 500 in the browser and a
 * stack only in the host's log leaves the person in front of the broken page
 * with nothing. Behind `authorize('admin')`, like everything else here.
 */
export async function dashboardSelfTest() {
  try {
    await getAdminDashboard();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, ...describeFailure(err) };
  }
}

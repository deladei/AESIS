import { prisma } from '../../config/prisma';
import { weeksDue, engagementPercent } from '../../shared/utils/quality';
import { durationWeeksByAcademicYear, weeksForYear } from '../entries/entries.week';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import { sendEmail } from '../../shared/utils/email';
import { refreshRiskSnapshots } from '../risk/risk.service';

// Engagement is measured off the active weekly-entry pipeline. A week "counts as
// submitted" once its entry has actually been submitted (submittedAt set);
// "pending" is awaiting supervisor action, "reviewed" is acted on.
const REVIEWED_ENTRY_STATUSES = ['acknowledged', 'returned'] as const;

const PULSE_LIMIT  = 6;
const RECENT_LIMIT = 6;

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

  const recentSubmissions = recentRows.map(s => ({
    id:          s.id,
    internName:  `${s.placement.student.firstName} ${s.placement.student.lastName}`,
    weekNumber:  s.weekNumber,
    submittedAt: s.submittedAt,
    status:      s.status,
  }));

  return {
    overview:          { activeInterns, pendingReviews, avgEngagement },
    pulseBoard,
    riskAlerts,
    recentSubmissions,
    submissionCounts:  { pending: pendingReviews, reviewed: reviewedCount },
  };
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

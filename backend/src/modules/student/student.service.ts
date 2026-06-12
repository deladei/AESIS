import { prisma } from '../../config/prisma';
import { meanQualityScore, weekProgress } from '../../shared/utils/quality';
import { hoursSummary } from '../../shared/utils/hours';
import { decryptPII } from '../../shared/utils/crypto';

// Entry states whose logged hours count toward attendance. A `draft` has not
// logged attendance yet; every other (submitted+) state has.
const HOURS_LOGGED_STATUSES = ['submitted', 'returned', 'acknowledged', 'rejected'];

// Maps the entries state machine (the active weekly workflow) onto the
// intern-facing status buckets. `draft` => in progress; there is no synthetic
// bucket — `rejected` is a real terminal state (see entry.stateMachine.ts).
type EntryStatusName = 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'rejected';

function statusBreakdownOf(entries: { status: EntryStatusName }[]) {
  const breakdown = {
    approved: 0,           // acknowledged
    pendingReview: 0,      // submitted
    revisionRequested: 0,  // returned
    rejected: 0,           // rejected
    inProgress: 0,         // draft
    total: entries.length,
  };
  for (const e of entries) {
    if (e.status === 'acknowledged') breakdown.approved++;
    else if (e.status === 'submitted') breakdown.pendingReview++;
    else if (e.status === 'returned') breakdown.revisionRequested++;
    else if (e.status === 'rejected') breakdown.rejected++;
    else breakdown.inProgress++;
  }
  return breakdown;
}

const EMPTY_BREAKDOWN = statusBreakdownOf([]);
const EMPTY_HOURS = { logged: 0, expected: 0, perWeekMin: 0, shortfall: false };

// Phone numbers are AES-256-GCM encrypted at rest; decryptPII throws on any
// malformed/legacy-plaintext value, so never let it break the dashboard.
function safeDecryptPhone(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptPII(stored);
  } catch {
    return null;
  }
}

type SupervisorRow = {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string | null;
} | null;

function shapeSupervisor(s: SupervisorRow, organization: string | null) {
  if (!s) return null;
  return {
    name:         `${s.firstName} ${s.lastName}`.trim(),
    email:        s.email,
    phone:        safeDecryptPhone(s.phone),
    organization,
  };
}

/**
 * Stats for the intern (student) dashboard.
 *
 * Computed server-side so the average is always a validated numeric mean and
 * the week count is always derived from the placement's real dates — neither a
 * string-concatenated score nor an out-of-range aggregate can reach the UI.
 */
export async function getStudentDashboard(studentId: string) {
  const placements = await prisma.placement.findMany({
    where:   { studentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:              true,
      startDate:       true,
      endDate:         true,
      placementStatus: true,
      academicYear: {
        select: {
          cohortConfigs: { select: { totalWeeks: true, minWeeklyHours: true }, take: 1 },
        },
      },
      company: { select: { name: true } },
      academicSupervisor: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      companySupervisor: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
      logbookSubmissions: {
        select: {
          submissionStatus: true,
          analysis: { select: { qualityScore: true } },
        },
      },
      // Active weekly workflow — drives the per-log status breakdown + hours.
      logbookEntries: { select: { status: true, hoursLogged: true, submittedAt: true } },
      // Learning objectives — progress counts CONFIRMED links only (AI
      // suggestions never count until a human confirms them).
      learningObjectives: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, entryLinks: { select: { status: true } } },
      },
    },
  });

  // Prefer the active placement, else the most recent — same rule the UI uses.
  const placement =
    placements.find(p => p.placementStatus === 'active') ?? placements[0];

  if (!placement) {
    return {
      hasActivePlacement: false,
      week:               null,
      logsSubmitted:      0,
      expectedLogs:       0,
      completionPct:      0,
      avgQualityScore:    null,
      statusBreakdown:    EMPTY_BREAKDOWN,
      hours:              EMPTY_HOURS,
      objectives:         [],
      supervisors:        { academic: null, company: null },
    };
  }

  // Progress reflects real activity: a week counts once its entry has actually
  // been submitted (the active entries pipeline), so a new placement reads 0 and
  // climbs only as the student submits — never from pre-seeded rows.
  const submittedCount = placement.logbookEntries.filter(e => e.submittedAt != null).length;

  // AI quality scores stay advisory and come from the legacy enrichment when
  // present; with no scored log the mean is null and the UI renders "—".
  const avgQualityScore = meanQualityScore(
    placement.logbookSubmissions.map(s => s.analysis?.qualityScore),
  );

  const week = weekProgress({
    startDate:        placement.startDate,
    endDate:          placement.endDate,
    totalWeeksConfig: placement.academicYear?.cohortConfigs?.[0]?.totalWeeks ?? null,
    submittedCount,
  });

  const completionPct = week.total > 0
    ? Math.min(100, Math.round((submittedCount / week.total) * 100))
    : 0;

  // Objective progress — only CONFIRMED entry links count.
  const objectives = placement.learningObjectives.map(o => ({
    id:    o.id,
    title: o.title,
    confirmedEntryCount: o.entryLinks.filter(l => l.status === 'confirmed').length,
  }));

  // Cumulative attendance: sum hoursLogged over submitted+ entries, against the
  // cohort's per-week minimum × the date-derived week count.
  const hours = hoursSummary({
    rawLoggedHours: placement.logbookEntries
      .filter(e => HOURS_LOGGED_STATUSES.includes(e.status))
      .map(e => e.hoursLogged),
    perWeekMin: placement.academicYear?.cohortConfigs?.[0]?.minWeeklyHours ?? 0,
    weeks: week.total,
  });

  return {
    hasActivePlacement: placement.placementStatus === 'active',
    week,                              // { current, total }
    logsSubmitted:   submittedCount,
    expectedLogs:    week.total,
    completionPct,
    avgQualityScore,                   // number (1 dp) within [0, 100], or null
    statusBreakdown: statusBreakdownOf(placement.logbookEntries as { status: EntryStatusName }[]),
    hours,                             // { logged, expected, perWeekMin, shortfall }
    objectives,                        // [{ id, title, confirmedEntryCount }]
    supervisors: {
      // Academic supervisor is faculty — no host org. Company supervisor's org
      // is the placement's host company.
      academic: shapeSupervisor(placement.academicSupervisor, null),
      company:  shapeSupervisor(placement.companySupervisor, placement.company?.name ?? null),
    },
  };
}

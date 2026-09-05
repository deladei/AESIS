import { prisma } from '../../config/prisma';
import {
  meanQualityScore, mergedQualityScores, weekProgress, weeksDue,
} from '../../shared/utils/quality';
import { hoursSummary } from '../../shared/utils/hours';
import { decryptPII } from '../../shared/utils/crypto';

// Entry states whose logged hours count toward attendance. A `draft` has not
// logged attendance yet; every other (submitted+) state has.
const HOURS_LOGGED_STATUSES = ['submitted', 'returned', 'acknowledged'];

// Maps the entries state machine (the active weekly workflow) onto the
// intern-facing status buckets. `draft` => in progress. A week the supervisor
// won't accept is `returned` for revision (see entry.stateMachine.ts).
type EntryStatusName = 'draft' | 'submitted' | 'returned' | 'acknowledged';

function statusBreakdownOf(entries: { status: EntryStatusName }[]) {
  const breakdown = {
    approved: 0,           // acknowledged
    pendingReview: 0,      // submitted
    revisionRequested: 0,  // returned
    inProgress: 0,         // draft
    total: entries.length,
  };
  for (const e of entries) {
    if (e.status === 'acknowledged') breakdown.approved++;
    else if (e.status === 'submitted') breakdown.pendingReview++;
    else if (e.status === 'returned') breakdown.revisionRequested++;
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
          // `durationWeeks` is the length the logbook itself enforces; the older
          // `totalWeeks` is kept only as a fallback for cohorts predating it.
          cohortConfigs: {
            select: { durationWeeks: true, totalWeeks: true, minWeeklyHours: true },
            take: 1,
          },
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
      // `days` carries the per-day submission state: the DAY (Mon–Fri) is the
      // unit the student actually submits, so progress counts a week the moment
      // any of its days is submitted — not only when the whole week is closed.
      logbookEntries: {
        select: {
          status: true,
          hoursLogged: true,
          submittedAt: true,
          days: { select: { status: true } },
          // Latest v2 assessment per week — the quality signal the retired
          // legacy writer no longer produces (see mergedQualityScores).
          assessments: {
            select: { quality: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
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

  // Profile completeness is DERIVED at read time, not stored: a stored
  // percentage goes stale the moment a field is filled in. Each item is a
  // field the student can actually act on.
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      phone: true, gender: true, indexNumber: true, avatarUrl: true,
      programmeId: true, academicLevel: true,
      department: { select: { name: true } },
      programme:  { select: { name: true } },
    },
  });
  const profileFields = [
    student?.phone, student?.gender, student?.indexNumber,
    student?.avatarUrl, student?.programmeId, student?.academicLevel,
  ];
  const profileFilled = profileFields.filter((v) => v !== null && v !== undefined).length;

  const profile = {
    academicLevel: student?.academicLevel ?? null,
    completionPct: Math.round((profileFilled / profileFields.length) * 100),
    department:    student?.department?.name ?? null,
    programme:     student?.programme?.name ?? null,
  };

  if (!placement) {
    // The student's own identity and profile completeness do not depend on a
    // placement, and the sidebar reads them on every page — so this branch
    // returns the same shape rather than a narrower one the UI would crash on.
    return {
      hasActivePlacement: false,
      profile,
      nextReview:         null,
      tasks:              { done: 0, total: 0 },
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

  // Progress reflects real activity: a week counts once the student has actually
  // logged something in it — i.e. at least one day submitted — OR the whole week
  // was submitted via the week-level path (covers legacy entries with no day
  // rows). A new placement reads 0 and climbs as the student logs; never from
  // pre-seeded rows.
  const submittedCount = placement.logbookEntries.filter(
    e => e.submittedAt != null || (e.days ?? []).some(d => d.status === 'submitted'),
  ).length;

  // AI quality stays advisory. Both pipelines feed one mean: the frozen legacy
  // analyses AND the v2 assessments the weekly entries carry. Reading only the
  // legacy side meant every student on the consolidated logbook saw "—" no
  // matter how many scored weeks they had. With no valid score anywhere the
  // mean is null and the UI still renders "—".
  const avgQualityScore = meanQualityScore(
    mergedQualityScores(
      placement.logbookSubmissions.map(s => s.analysis?.qualityScore),
      placement.logbookEntries,
    ),
  );

  const cohort = placement.academicYear?.cohortConfigs?.[0];
  const week = weekProgress({
    startDate:        placement.startDate,
    endDate:          placement.endDate,
    totalWeeksConfig: cohort?.durationWeeks ?? cohort?.totalWeeks ?? null,
    submittedCount,
  });
  // What the student owes SO FAR. `week.total` is the whole programme — right
  // for "week 3 of 24", wrong as the denominator of a target they are still
  // working towards.
  const due = weeksDue(placement.startDate, week.total);

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
  // cohort's per-week minimum × the weeks that have come due. Billing it against
  // the whole programme made every intern "below target" until their last week —
  // harmless-looking at 6 weeks, absurd at 24 (960 h owed in week three).
  const hours = hoursSummary({
    rawLoggedHours: placement.logbookEntries
      .filter(e => HOURS_LOGGED_STATUSES.includes(e.status))
      .map(e => e.hoursLogged),
    perWeekMin: cohort?.minWeeklyHours ?? 0,
    weeks: due,
  });

  // The next review the student has been booked into, if any.
  const nextVisit = await prisma.visitSchedule.findFirst({
    where: {
      placementId: placement.id,
      cancelledAt: null,
      completed: false,
      scheduledAt: { gte: new Date() },
    },
    orderBy: { scheduledAt: 'asc' },
    select: { id: true, scheduledAt: true, visitType: true, location: true, durationMinutes: true },
  });

  // "18 / 28" counted from real rows. Cancelled tasks are in neither half.
  const [tasksDone, tasksTotal] = await Promise.all([
    prisma.task.count({ where: { assigneeId: studentId, status: 'done' } }),
    prisma.task.count({ where: { assigneeId: studentId, status: { not: 'cancelled' } } }),
  ]);

  return {
    hasActivePlacement: placement.placementStatus === 'active',
    profile,
    nextReview: nextVisit,
    tasks: { done: tasksDone, total: tasksTotal },
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

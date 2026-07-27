import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { parseDateOnly, todayUtc, daysBetween } from '../entries/entry.dates';
import { authorizePlacement, type Actor } from '../entries/entries.policy';
import {
  classifyDay,
  evaluateDayAdmissibility,
  weekNumberFor,
  weeksInAttachment,
  withinEditWindow,
  type AttachmentCalendar,
  type AdmissibilityRules,
  type DayClass,
} from './siwes.calendar';
import type {
  SaveDailyEntryInput,
  SaveWeeklySummaryInput,
  RecordAbsenceInput,
  CreateNonWorkingDayInput,
  CalendarQuery,
} from './siwes.schema';

// SIWES daily logbook (Batch 1): daily_entry / weekly_summary / absence /
// non_working_day. DB teeth (created_at immutability, delete denial) live in
// the migration; this service owns admissibility + day classification and the
// chain-aware calendar. Authorization reuses entries.policy — the single
// decision point for placement access.

const DAY_MS = 86_400_000;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

// ── Attachment context (chain + cohort calendar) ──────────────

export interface AttachmentContext {
  placement: {
    id: string;
    studentId: string;
    placementStatus: string;
    isCurrent: boolean;
    academicYearId: string;
  };
  cal: AttachmentCalendar;
  rules: AdmissibilityRules;
  /** endDate ?? chainStart + durationWeeks — the calendar always has an end. */
  effectiveEnd: Date;
}

/**
 * Resolve the supersedes chain to its root. The attachment is continuous
 * across an approved transfer, so every date/week rule anchors on the FIRST
 * placement's start date — week numbering never resets.
 */
async function resolveChainStart(placement: {
  id: string;
  startDate: Date | null;
  supersedesPlacementId: string | null;
}): Promise<Date> {
  let current = placement;
  const seen = new Set<string>([placement.id]);
  while (current.supersedesPlacementId) {
    const parent = await prisma.placement.findUnique({
      where: { id: current.supersedesPlacementId },
      select: { id: true, startDate: true, supersedesPlacementId: true },
    });
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  if (!current.startDate) {
    throw new AppError(409, 'The attachment has no configured start date');
  }
  // Normalize to a UTC date-only anchor.
  return parseDateOnly(iso(current.startDate), 'startDate');
}

/** Load everything the calendar rules need for one placement, post-authorization. */
export async function loadAttachmentContext(
  actor: Actor,
  placementId: string,
  mode: 'read' | 'write',
): Promise<AttachmentContext> {
  await authorizePlacement(actor, placementId, mode);

  const placement = await prisma.placement.findUniqueOrThrow({
    where: { id: placementId },
    select: {
      id: true,
      studentId: true,
      placementStatus: true,
      isCurrent: true,
      academicYearId: true,
      startDate: true,
      endDate: true,
      supersedesPlacementId: true,
    },
  });

  const [config, holidays] = await Promise.all([
    prisma.cohortConfig.findFirst({ where: { academicYearId: placement.academicYearId } }),
    prisma.nonWorkingDay.findMany({
      where: { academicYearId: placement.academicYearId },
      select: { day: true },
    }),
  ]);

  const chainStart = await resolveChainStart(placement);
  const durationWeeks = config?.durationWeeks ?? 6;
  const effectiveEnd = placement.endDate
    ? parseDateOnly(iso(placement.endDate), 'endDate')
    : addDays(chainStart, durationWeeks * 7 - 1);

  return {
    placement: {
      id: placement.id,
      studentId: placement.studentId,
      placementStatus: placement.placementStatus,
      isCurrent: placement.isCurrent,
      academicYearId: placement.academicYearId,
    },
    cal: {
      chainStart,
      chainEnd: effectiveEnd,
      workingDays: config?.workingDays?.length ? config.workingDays : [1, 2, 3, 4, 5],
      nonWorkingDays: new Set(holidays.map((h) => iso(h.day))),
    },
    rules: {
      entryEditWindowDays: config?.entryEditWindowDays ?? 2,
      syncGraceDays: config?.syncGraceDays ?? 3,
    },
    effectiveEnd,
  };
}

// Writes happen on the student's CURRENT, live placement. transferred_out and
// cancelled chains are closed to writes — after a transfer the student logs on
// the successor (same chain calendar, so nothing is lost).
function assertWritablePlacement(ctx: AttachmentContext): void {
  const { placementStatus, isCurrent } = ctx.placement;
  if (!isCurrent || !['active', 'completed'].includes(placementStatus)) {
    throw new AppError(409, 'This placement is not open for logbook writes');
  }
}

// ── Serialization (lateness is DERIVED, never stored) ─────────

type DailyEntryRow = Prisma.DailyEntryGetPayload<Record<string, never>>;

function serializeDailyEntry(row: DailyEntryRow, rules: AdmissibilityRules) {
  const workDate = parseDateOnly(iso(row.workDate), 'workDate');
  const loggedOn = parseDateOnly(iso(row.createdAt), 'createdAt');
  const lateByDays = Math.max(0, daysBetween(workDate, loggedOn));
  return {
    id: row.id,
    placementId: row.placementId,
    weekNumber: row.weekNumber,
    workDate: iso(row.workDate),
    descriptionOfWork: row.descriptionOfWork,
    newSkillsLearnt: row.newSkillsLearnt,
    sketchUrl: row.sketchUrl,
    clientDraftedAt: row.clientDraftedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    loggedLate: lateByDays > 0,
    lateByDays,
    editableUntil: new Date(row.createdAt.getTime() + rules.entryEditWindowDays * DAY_MS),
  };
}

/**
 * Resolve the week (LogbookEntry) that owns a student-relative week number,
 * creating it as a draft the first time the student logs into that week.
 *
 * Consolidated S87: every day and weekly report hangs off a week, because the
 * week is the unit the supervisor acknowledges and the grade spine reads. The
 * key is (student, week) — student-relative, so it survives a transfer.
 */
async function resolveWeekEntry(
  tx: Prisma.TransactionClient,
  ctx: AttachmentContext,
  weekNumber: number,
) {
  const weekStart = addDays(ctx.cal.chainStart, (weekNumber - 1) * 7);
  const entry = await tx.logbookEntry.upsert({
    where: {
      studentId_weekNumber: { studentId: ctx.placement.studentId, weekNumber },
    },
    create: {
      studentId: ctx.placement.studentId,
      placementId: ctx.placement.id,
      weekNumber,
      periodStart: weekStart,
      periodEnd: addDays(weekStart, 6),
      status: 'draft',
    },
    update: {},
  });

  // `acknowledged` is terminal and locks the week — mirrors the entries state
  // machine (isEditable = draft | returned) rather than re-deriving the rule.
  if (entry.status === 'acknowledged') {
    throw new AppError(409, 'This week has been acknowledged and is locked');
  }
  return entry;
}

/**
 * The trainee's weekly report, rebuilt from the week + its reflection. Keeps the
 * pre-consolidation response shape (`weekNumber` / `weekEnding` / `reportText`)
 * so the student UI keeps working while the two front-ends are merged.
 */
function serializeWeeklyReport(
  entry: { id: string; placementId: string; weekNumber: number; createdAt: Date },
  reflection: { learning: string; updatedAt: Date },
  weekEnding: Date,
) {
  return {
    id: entry.id,
    placementId: entry.placementId,
    weekNumber: entry.weekNumber,
    weekEnding: iso(weekEnding),
    reportText: reflection.learning,
    createdAt: entry.createdAt,
    updatedAt: reflection.updatedAt,
  };
}

// ── Daily entries ─────────────────────────────────────────────

export async function saveDailyEntry(actor: Actor, input: SaveDailyEntryInput) {
  const ctx = await loadAttachmentContext(actor, input.placementId, 'write');
  assertWritablePlacement(ctx);

  const workDate = parseDateOnly(input.workDate, 'workDate');
  const today = todayUtc();

  const verdict = evaluateDayAdmissibility(workDate, today, ctx.cal, ctx.rules);
  if (!verdict.admissible) throw new AppError(422, verdict.reason);

  // A recorded absence and a work entry on the same day contradict each other.
  const absence = await prisma.absence.findUnique({
    where: {
      studentId_absenceDate: { studentId: ctx.placement.studentId, absenceDate: workDate },
    },
  });
  if (absence) {
    throw new AppError(409, `This day is recorded as an absence (${absence.kind})`);
  }

  const weekNumber = weekNumberFor(workDate, ctx.cal.chainStart);
  const data = {
    descriptionOfWork: input.descriptionOfWork,
    newSkillsLearnt: input.newSkillsLearnt,
    sketchUrl: input.sketchUrl ?? null,
    clientDraftedAt: input.clientDraftedAt ? new Date(input.clientDraftedAt) : null,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const entry = await resolveWeekEntry(tx, ctx, weekNumber);

    const existing = await tx.dailyEntry.findUnique({
      where: {
        studentId_workDate: { studentId: ctx.placement.studentId, workDate },
      },
    });

    if (existing) {
      // created_at is immutable server evidence; the edit window counts from it.
      if (!withinEditWindow(existing.createdAt, new Date(), ctx.rules)) {
        throw new AppError(409, 'The edit window for this entry has closed');
      }
      if (existing.status === 'submitted' && entry.status !== 'returned') {
        throw new AppError(409, 'This day is already submitted; it cannot be edited');
      }
      return tx.dailyEntry.update({ where: { id: existing.id }, data });
    }

    return tx.dailyEntry.create({
      data: {
        ...data,
        entryId: entry.id,
        studentId: ctx.placement.studentId,
        placementId: ctx.placement.id,
        weekNumber,
        workDate,
      },
    });
  });

  return serializeDailyEntry(saved, ctx.rules);
}

// ── Weekly summaries ──────────────────────────────────────────

export async function saveWeeklySummary(actor: Actor, input: SaveWeeklySummaryInput) {
  const ctx = await loadAttachmentContext(actor, input.placementId, 'write');
  assertWritablePlacement(ctx);

  const today = todayUtc();
  const totalWeeks = weeksInAttachment(ctx.cal.chainStart, ctx.effectiveEnd);
  if (input.weekNumber > totalWeeks) {
    throw new AppError(422, `The attachment spans ${totalWeeks} week(s)`);
  }
  const weekStart = addDays(ctx.cal.chainStart, (input.weekNumber - 1) * 7);
  if (weekStart.getTime() > today.getTime()) {
    throw new AppError(422, 'Cannot report on a week that has not started');
  }
  if (daysBetween(ctx.effectiveEnd, today) > ctx.rules.syncGraceDays) {
    throw new AppError(422, 'The logbook is closed for this attachment');
  }

  // weekEnding is derived from the chain calendar — the client never sets it.
  const weekEnding = addDays(weekStart, 6);

  // Consolidated S87: the trainee's weekly report IS the week's reflection —
  // one narrative per week, stored once, so enrichment and the supervisor
  // review see the same text the student wrote.
  return prisma.$transaction(async (tx) => {
    const entry = await resolveWeekEntry(tx, ctx, input.weekNumber);

    const existing = await tx.entryReflection.findUnique({ where: { entryId: entry.id } });
    if (existing && !withinEditWindow(entry.createdAt, new Date(), ctx.rules)) {
      throw new AppError(409, 'The edit window for this weekly report has closed');
    }

    const reflection = await tx.entryReflection.upsert({
      where: { entryId: entry.id },
      create: { entryId: entry.id, learning: input.reportText, challenges: '' },
      update: { learning: input.reportText },
    });

    return serializeWeeklyReport(entry, reflection, weekEnding);
  });
}

// ── Absences ──────────────────────────────────────────────────

export async function recordAbsence(actor: Actor, input: RecordAbsenceInput) {
  // 'read' establishes placement scope (own/assigned); the role rules below
  // decide who may RECORD. Students self-report sick/permitted only —
  // 'unexcused' is a staff judgement, not a self-served label.
  const ctx = await loadAttachmentContext(actor, input.placementId, 'read');

  const isStaff = ['academic_supervisor', 'coordinator', 'hod', 'admin'].includes(actor.role);
  if (!isStaff) {
    if (actor.id !== ctx.placement.studentId) throw new AppError(403, 'Access denied');
    if (input.kind === 'unexcused') {
      throw new AppError(403, 'Only staff may record an unexcused absence');
    }
  }
  assertWritablePlacement(ctx);

  const absenceDate = parseDateOnly(input.absenceDate, 'absenceDate');
  const today = todayUtc();
  const verdict = evaluateDayAdmissibility(absenceDate, today, ctx.cal, ctx.rules);
  if (!verdict.admissible) throw new AppError(422, verdict.reason);

  const entry = await prisma.dailyEntry.findUnique({
    where: {
      studentId_workDate: { studentId: ctx.placement.studentId, workDate: absenceDate },
    },
  });
  if (entry) {
    throw new AppError(409, 'This day already has a logged entry — it cannot also be an absence');
  }

  try {
    return await prisma.absence.create({
      data: {
        studentId: ctx.placement.studentId,
        placementId: ctx.placement.id,
        absenceDate,
        kind: input.kind,
        reason: input.reason ?? null,
        recordedById: actor.id,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'An absence is already recorded for this day');
    }
    throw err;
  }
}

// ── Cohort holiday calendar ───────────────────────────────────

export async function createNonWorkingDay(input: CreateNonWorkingDayInput) {
  const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw new AppError(404, 'Academic year not found');
  try {
    return await prisma.nonWorkingDay.create({
      data: {
        academicYearId: input.academicYearId,
        day: parseDateOnly(input.day, 'day'),
        label: input.label,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'This day is already a non-working day for the academic year');
    }
    throw err;
  }
}

export async function listNonWorkingDays(academicYearId: string) {
  return prisma.nonWorkingDay.findMany({
    where: { academicYearId },
    orderBy: { day: 'asc' },
  });
}

export async function deleteNonWorkingDay(id: string) {
  const existing = await prisma.nonWorkingDay.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Non-working day not found');
  // Calendar CONFIG, not evidence — deletable, unlike the logbook tables.
  await prisma.nonWorkingDay.delete({ where: { id } });
}

// ── Chain-aware logbook calendar ──────────────────────────────

export interface CalendarDay {
  date: string;
  weekNumber: number;
  class: DayClass;
  entry: ReturnType<typeof serializeDailyEntry> | null;
  absence: { id: string; kind: string; reason: string | null; recordedById: string | null } | null;
  /** A past working day with neither an entry nor an absence. Never fires on
   *  holidays/rest days — that is what classification is for. */
  missing: boolean;
}

export async function getLogbookCalendar(
  actor: Actor,
  placementId: string,
  query: CalendarQuery,
) {
  const ctx = await loadAttachmentContext(actor, placementId, 'read');
  const today = todayUtc();

  const from = query.from ? parseDateOnly(query.from, 'from') : ctx.cal.chainStart;
  const defaultTo = today.getTime() < ctx.effectiveEnd.getTime() ? today : ctx.effectiveEnd;
  const to = query.to ? parseDateOnly(query.to, 'to') : defaultTo;
  if (to.getTime() < from.getTime()) throw new AppError(422, "'to' is before 'from'");
  if (daysBetween(from, to) > 400) throw new AppError(422, 'Range too large');

  // Entries/absences are student-scoped (unique per student+date), so a single
  // query spans the whole supersedes chain regardless of which placement each
  // row was logged under.
  const [entries, absences, summaries] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { studentId: ctx.placement.studentId, workDate: { gte: from, lte: to } },
    }),
    prisma.absence.findMany({
      where: { studentId: ctx.placement.studentId, absenceDate: { gte: from, lte: to } },
    }),
    // Weekly reports now live as the week's reflection (S87). Only weeks that
    // actually carry a narrative are returned, matching the old behaviour of
    // returning only written summaries.
    prisma.logbookEntry.findMany({
      where: { studentId: ctx.placement.studentId, reflection: { isNot: null } },
      orderBy: { weekNumber: 'asc' },
      include: { reflection: true },
    }),
  ]);

  const entryByDate = new Map(entries.map((e) => [iso(e.workDate), e]));
  const absenceByDate = new Map(absences.map((a) => [iso(a.absenceDate), a]));

  const days: CalendarDay[] = [];
  for (let d = from; d.getTime() <= to.getTime(); d = addDays(d, 1)) {
    const key = iso(d);
    const cls = classifyDay(d, ctx.cal);
    const entry = entryByDate.get(key) ?? null;
    const absence = absenceByDate.get(key) ?? null;
    days.push({
      date: key,
      weekNumber: weekNumberFor(d, ctx.cal.chainStart),
      class: cls,
      entry: entry ? serializeDailyEntry(entry, ctx.rules) : null,
      absence: absence
        ? { id: absence.id, kind: absence.kind, reason: absence.reason, recordedById: absence.recordedById }
        : null,
      missing: cls === 'working' && !entry && !absence && d.getTime() < today.getTime(),
    });
  }

  return {
    placementId: ctx.placement.id,
    chainStart: iso(ctx.cal.chainStart),
    chainEnd: iso(ctx.effectiveEnd),
    totalWeeks: weeksInAttachment(ctx.cal.chainStart, ctx.effectiveEnd),
    days,
    weeklySummaries: summaries.map((w) =>
      serializeWeeklyReport(w, w.reflection!, addDays(ctx.cal.chainStart, (w.weekNumber - 1) * 7 + 6)),
    ),
  };
}

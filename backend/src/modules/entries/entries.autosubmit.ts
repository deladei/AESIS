import { prisma } from '../../config/prisma';
import { classifyDay, type AttachmentCalendar } from '../siwes/siwes.calendar';
import type { Actor } from './entries.policy';

/**
 * Decide whether a week is COMPLETE — every one of its working days accounted
 * for — and optionally submit it.
 *
 * The point is lateness: a student who has written up all five days has nothing
 * left to add, and a week sitting in `draft` past its deadline is counted late
 * for no reason. But submitting the instant the last day is saved takes away
 * their chance to reread the week first, so the two callers differ:
 *
 * - The save path asks (`submit: null`) and the UI offers "submit now" or
 *   "review first".
 * - The deadline job (`jobs/weekAutoSubmit.ts`) submits, so a student who chose
 *   to review and then forgot is still not marked late.
 *
 * Deliberately conservative:
 * - A partial week is never auto-submitted. Four of five days leaves the week in
 *   draft, exactly as before.
 * - A day the student could not work still counts as accounted for when they
 *   recorded an absence — otherwise a sick day would make the week unsubmittable
 *   by this path.
 * - Holidays and rest days are not working days (`classifyDay`), so a
 *   four-working-day week auto-submits on its fourth day, not never.
 * - Only from `draft`. A returned week is the student's to resubmit by hand; a
 *   submitted or acknowledged week is untouched.
 *
 * It routes through the normal `submitEntry` service, so the state machine,
 * the append-only event and the supervisor notification all behave exactly as
 * they do for a manual submit — the only difference is who pressed the button.
 */

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export interface AutoSubmitOutcome {
  /** True only when this call actually transitioned the week. */
  submitted: boolean;
  /** Every working day accounted for — the week could be submitted right now. */
  complete: boolean;
  /** Working days in the week that still have neither an entry nor an absence. */
  remaining: number;
  workingDays: number;
}

/** Every working day in the week, per the cohort calendar. */
async function workingDaysOfWeek(
  placementId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<string[]> {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: { academicYearId: true },
  });
  if (!placement) return [];

  const [config, holidays] = await Promise.all([
    prisma.cohortConfig.findFirst({
      where: { academicYearId: placement.academicYearId },
      select: { workingDays: true },
    }),
    prisma.nonWorkingDay.findMany({
      where: { academicYearId: placement.academicYearId },
      select: { day: true },
    }),
  ]);

  const cal: AttachmentCalendar = {
    // The week's own bounds are the range being classified, so the attachment
    // bounds must not exclude any of it.
    chainStart: periodStart,
    chainEnd: periodEnd,
    workingDays: config?.workingDays?.length ? config.workingDays : [1, 2, 3, 4, 5],
    nonWorkingDays: new Set(holidays.map((h) => iso(h.day))),
  };

  const out: string[] = [];
  for (
    let t = periodStart.getTime();
    t <= periodEnd.getTime();
    t += 86_400_000
  ) {
    const d = new Date(t);
    if (classifyDay(d, cal) === 'working') out.push(iso(d));
  }
  return out;
}

/**
 * Called after any day write. Returns what it decided so the caller can tell
 * the student how many days are left before the week goes automatically.
 */
export async function evaluateWeekCompletion(
  actor: Actor,
  entryId: string,
  /** Pass null to only report; pass the service to submit a complete week. */
  submit: ((actor: Actor, entryId: string) => Promise<unknown>) | null,
): Promise<AutoSubmitOutcome> {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true, status: true, placementId: true, studentId: true,
      periodStart: true, periodEnd: true,
    },
  });
  if (!entry) return { submitted: false, complete: false, remaining: 0, workingDays: 0 };

  const working = await workingDaysOfWeek(entry.placementId, entry.periodStart, entry.periodEnd);
  if (working.length === 0) return { submitted: false, complete: false, remaining: 0, workingDays: 0 };

  const [logged, absences] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { entryId: entry.id },
      select: { workDate: true, descriptionOfWork: true },
    }),
    prisma.absence.findMany({
      where: {
        studentId: entry.studentId,
        absenceDate: { gte: entry.periodStart, lte: entry.periodEnd },
      },
      select: { absenceDate: true },
    }),
  ]);

  // A day counts as written up only when it actually carries content — a status
  // row created by the attachment flow is not a logged day.
  const accounted = new Set<string>([
    ...logged.filter((d) => (d.descriptionOfWork ?? '').trim().length > 0).map((d) => iso(d.workDate)),
    ...absences.map((a) => iso(a.absenceDate)),
  ]);

  const remaining = working.filter((d) => !accounted.has(d)).length;
  const complete = remaining === 0 && entry.status === 'draft';

  if (!complete || !submit) {
    return { submitted: false, complete, remaining, workingDays: working.length };
  }

  await submit(actor, entry.id);
  return { submitted: true, complete: true, remaining: 0, workingDays: working.length };
}

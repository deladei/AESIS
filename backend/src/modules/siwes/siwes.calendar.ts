import { daysBetween } from '../entries/entry.dates';

// Pure SIWES calendar rules — day classification, student-relative week
// numbering, and entry admissibility. Extracted pure so every rule is
// unit-tested without a database. All dates are UTC-midnight date-onlys
// (see entry.dates.ts — Ghana is UTC+0 year-round).

// The attachment calendar as the rules need it. `chainStart` is the FIRST
// placement's start date in the supersedes chain and `chainEnd` the current
// placement's end date — the attachment is continuous across a transfer, so
// week numbering never resets (weekNumber is student-relative).
export interface AttachmentCalendar {
  chainStart: Date;
  chainEnd: Date | null; // null = no configured end (no outer bound)
  workingDays: number[]; // ISO weekday numbers, 1 = Monday … 7 = Sunday
  nonWorkingDays: Set<string>; // 'YYYY-MM-DD' cohort holidays
}

export type DayClass =
  | 'working' // a loggable attachment day
  | 'weekly_rest' // not in the cohort's working-day pattern (e.g. weekend)
  | 'non_working' // declared cohort holiday
  | 'before_attachment'
  | 'after_attachment';

/** ISO weekday (1 = Monday … 7 = Sunday) of a UTC-midnight date. */
export function isoWeekday(d: Date): number {
  const dow = d.getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Classify one calendar day. Order matters: a day outside the attachment is
 * out-of-range regardless of holidays; a declared holiday beats the weekday
 * pattern (so the missing-entry flag never fires on Independence Day).
 */
export function classifyDay(date: Date, cal: AttachmentCalendar): DayClass {
  if (date.getTime() < cal.chainStart.getTime()) return 'before_attachment';
  if (cal.chainEnd && date.getTime() > cal.chainEnd.getTime()) return 'after_attachment';
  if (cal.nonWorkingDays.has(iso(date))) return 'non_working';
  if (!cal.workingDays.includes(isoWeekday(date))) return 'weekly_rest';
  return 'working';
}

/**
 * Student-relative week number for a date: week 1 starts on chainStart, each
 * week is 7 calendar days. Continuous across transfers by construction —
 * derived from the chain start, never from the current placement.
 */
export function weekNumberFor(date: Date, chainStart: Date): number {
  return Math.floor(daysBetween(chainStart, date) / 7) + 1;
}

/** How many week slots the attachment spans (partial last week counts). */
export function weeksInAttachment(chainStart: Date, chainEnd: Date): number {
  return Math.max(1, Math.floor(daysBetween(chainStart, chainEnd) / 7) + 1);
}

export interface AdmissibilityRules {
  syncGraceDays: number; // hard outer bound for ANY write past chainEnd
  entryEditWindowDays: number; // days after creation an entry stays editable
}

export type AdmissibilityVerdict =
  | { admissible: true; loggedLate: boolean; lateByDays: number }
  | { admissible: false; reason: string };

/**
 * May a daily entry for `workDate` be created/updated today? Never blocks a
 * forgotten past day inside the attachment (it arrives FLAGGED late instead —
 * lateness is derived, not stored), but:
 *  - future days are inadmissible (the logbook records work done, not planned);
 *  - non-working days are inadmissible (that is the point of classification);
 *  - once today is past chainEnd + syncGraceDays the logbook is frozen.
 */
export function evaluateDayAdmissibility(
  workDate: Date,
  today: Date,
  cal: AttachmentCalendar,
  rules: AdmissibilityRules,
): AdmissibilityVerdict {
  if (workDate.getTime() > today.getTime()) {
    return { admissible: false, reason: 'Cannot log a future day' };
  }
  const cls = classifyDay(workDate, cal);
  if (cls === 'before_attachment' || cls === 'after_attachment') {
    return { admissible: false, reason: 'Date is outside the attachment period' };
  }
  if (cls === 'non_working' || cls === 'weekly_rest') {
    return { admissible: false, reason: 'Date is not a working day for this cohort' };
  }
  if (cal.chainEnd && daysBetween(cal.chainEnd, today) > rules.syncGraceDays) {
    return { admissible: false, reason: 'The logbook is closed for this attachment' };
  }
  const lateByDays = daysBetween(workDate, today);
  return { admissible: true, loggedLate: lateByDays > 0, lateByDays };
}

/**
 * May a row created at `createdAt` still be edited today? created_at is server
 * evidence (immutable via DB trigger); the edit window counts from it.
 */
export function withinEditWindow(createdAt: Date, now: Date, rules: AdmissibilityRules): boolean {
  return now.getTime() - createdAt.getTime() <= rules.entryEditWindowDays * 86_400_000;
}

import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { DAY_GRACE_DAYS } from '../entries/entries.day.service';

/**
 * End-of-internship recap — the student's own record of their attachment,
 * played back to them.
 *
 * CONFIDENTIALITY: this reads ONLY student-authored data. Permitted sources are
 * the student's own daily entries, their submission timestamps and counts,
 * their activities and competency tags, and their own reflections.
 *
 * It must never read `assessment_industry` (the sealed-envelope evaluation the
 * student and academic supervisor never see), `final_grade`, `ai_assessment`
 * (advisory enrichment scores), or a supervisor's acknowledge comment/score on
 * `entry_event`. There is deliberately no join, view or service-role query that
 * would reach any of them — if a future card seems to need one, the answer is
 * to change the card.
 */

export interface RecapCard {
  totalEntries: number;
  weeksCovered: number;
  totalWeeksInAttachment: number;
  daysOnTime: number;
  longestOnTimeStreak: number;
  graceDays: number;
  themes: { tag: string; count: number }[];
  skills: string[];
  challenges: string[];
  firstEntryDate: string | null;
  lastEntryDate: string | null;
}

/** A short, quotable line — recap cards show phrases, not essays. */
function excerpt(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Longest run of consecutive weeks that the student submitted with no day in
 * them logged late. Consecutive by week number, so a gap breaks the run.
 */
function longestStreak(weeks: { weekNumber: number; onTime: boolean }[]): number {
  const ordered = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of ordered) {
    if (!w.onTime) { run = 0; prev = w.weekNumber; continue; }
    run = prev !== null && w.weekNumber === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w.weekNumber;
  }
  return best;
}

export async function getInternshipRecap(studentId: string): Promise<{
  available: boolean;
  reason?: string;
  recap?: RecapCard;
}> {
  // Gate: the attachment is over only when the placement is finalized. That
  // status already requires every week acknowledged or waived plus a recorded
  // assessment (finalization.service), so nothing else needs re-deriving here.
  const placement = await prisma.placement.findFirst({
    where: { studentId, finalizationStatus: 'finalized' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, academicYearId: true },
  });
  if (!placement) {
    return { available: false, reason: 'Your recap unlocks once your internship is finalised.' };
  }

  const [days, entries, activities, reflections, config] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { studentId },
      select: { workDate: true, weekNumber: true, newSkillsLearnt: true, createdAt: true },
      orderBy: { workDate: 'asc' },
    }),
    prisma.logbookEntry.findMany({
      where: { studentId },
      select: { weekNumber: true, status: true, submittedAt: true },
    }),
    prisma.entryActivity.findMany({
      where: { entry: { studentId } },
      select: { competencyTags: true },
    }),
    prisma.entryReflection.findMany({
      where: { entry: { studentId } },
      select: { challenges: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.cohortConfig.findFirst({
      where: { academicYearId: placement.academicYearId },
      select: { durationWeeks: true },
    }),
  ]);

  // On time means written within the same grace window the student was shown
  // while logging: DAY_GRACE_DAYS is the point past which the logbook warns
  // "you're logging this N days late". A stricter rule here would break a
  // student's streak over lateness the app never flagged to them. created_at is
  // immutable at the DB (trigger), so this cannot be gamed after the fact.
  const daysLate = (d: { workDate: Date; createdAt: Date }) => {
    const workDay = Date.parse(`${d.workDate.toISOString().slice(0, 10)}T00:00:00Z`);
    const writtenDay = Date.parse(`${d.createdAt.toISOString().slice(0, 10)}T00:00:00Z`);
    return Math.round((writtenDay - workDay) / 86_400_000);
  };
  const dayIsOnTime = (d: { workDate: Date; createdAt: Date }) => daysLate(d) <= DAY_GRACE_DAYS;

  const daysOnTime = days.filter(dayIsOnTime).length;

  const lateWeeks = new Set(days.filter((d) => !dayIsOnTime(d)).map((d) => d.weekNumber));
  const submittedWeeks = entries
    .filter((e) => e.status !== 'draft')
    .map((e) => ({ weekNumber: e.weekNumber, onTime: !lateWeeks.has(e.weekNumber) }));

  const tagCounts = new Map<string, number>();
  for (const a of activities) {
    for (const tag of a.competencyTags) {
      const key = tag.trim();
      if (key) tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
    }
  }
  const themes = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 6);

  // Skills come from what the student wrote in "new skills learnt" — most
  // recent first, de-duplicated, trimmed to something quotable.
  const seenSkills = new Set<string>();
  const skills: string[] = [];
  for (let i = days.length - 1; i >= 0 && skills.length < 6; i--) {
    const raw = days[i].newSkillsLearnt?.trim();
    if (!raw) continue;
    const line = excerpt(raw);
    const key = line.toLowerCase();
    if (seenSkills.has(key)) continue;
    seenSkills.add(key);
    skills.push(line);
  }

  const challenges = reflections
    .map((r) => r.challenges?.trim())
    .filter((c): c is string => !!c)
    .slice(0, 3)
    .map((c) => excerpt(c, 200));

  const weeksCovered = new Set(days.map((d) => d.weekNumber)).size;

  return {
    available: true,
    recap: {
      totalEntries: days.length,
      weeksCovered,
      totalWeeksInAttachment: config?.durationWeeks ?? weeksCovered,
      daysOnTime,
      graceDays: DAY_GRACE_DAYS,
      longestOnTimeStreak: longestStreak(submittedWeeks),
      themes,
      skills,
      challenges,
      firstEntryDate: days[0]?.workDate.toISOString().slice(0, 10) ?? null,
      lastEntryDate: days[days.length - 1]?.workDate.toISOString().slice(0, 10) ?? null,
    },
  };
}

/** Guard used by the controller so a non-student can never request one. */
export function assertOwnRecap(actorRole: string): void {
  if (actorRole !== 'student' && actorRole !== 'admin') {
    throw new AppError(403, 'Only a student can view their own recap');
  }
}

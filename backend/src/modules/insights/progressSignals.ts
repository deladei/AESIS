import { toQualityNumber, v2QualityOverall } from '../../shared/utils/quality';

/**
 * Signals a supervisor would not see by reading one week.
 *
 * Everything here is a PATTERN ACROSS WEEKS. A single entry can be read in a
 * minute and judged fairly; what a person cannot do by hand is hold six weeks
 * of twelve students in their head and notice that one of them has been
 * quietly narrowing, or repeating themselves, or sliding. That is the only
 * thing this file is for.
 *
 * Three rules it keeps:
 *
 * 1. Every signal carries its own evidence — the actual weeks and numbers.
 *    A flag without them is an accusation a supervisor cannot check.
 * 2. Nothing is inferred from silence. Too few assessed weeks means NO signal,
 *    not a good one and not a bad one.
 * 3. None of it is a grade, and none of it is a verdict. These say "look
 *    here", never "this student is failing".
 *
 * The computation is pure and lives apart from the query so it can be tested
 * against fixtures rather than a database.
 */

export type SignalKind =
  | 'quality_decline'
  | 'repetition'
  | 'narrowing_exposure'
  | 'deadline_only'
  | 'thin_reflection';

export interface ProgressSignal {
  kind:     SignalKind;
  /** `watch` = worth a glance. `high` = worth a conversation. Never a grade. */
  severity: 'watch' | 'high';
  headline: string;
  /** The numbers behind the headline, so the supervisor can check the claim. */
  evidence: string;
}

export interface SignalWeek {
  weekNumber:   number;
  submittedAt:  Date | null;
  periodEnd:    Date | null;
  /** Latest assessment's `quality` blob, untrusted. */
  quality:      unknown;
  /** Latest assessment's `plagiarism` blob, untrusted. */
  plagiarism:   unknown;
  competencyTags: string[];
  reflectionWords: number;
}

/** Weeks whose quality is actually readable, oldest first. */
function scoredWeeks(weeks: SignalWeek[]): { weekNumber: number; score: number }[] {
  return weeks
    .map((w) => ({ weekNumber: w.weekNumber, score: v2QualityOverall(w.quality) }))
    .filter((w): w is { weekNumber: number; score: number } => w.score !== null)
    .sort((a, b) => a.weekNumber - b.weekNumber);
}

/**
 * Three consecutive assessed weeks each below the one before.
 *
 * Three, not two: two is noise — a quiet week after a busy one is ordinary.
 * A third consecutive fall is a direction. The total drop must also be worth
 * mentioning, so a 79→78→77 drift does not summon a supervisor.
 */
const DECLINE_MIN_DROP = 10;

function qualityDecline(weeks: SignalWeek[]): ProgressSignal | null {
  const scored = scoredWeeks(weeks);
  if (scored.length < 3) return null;

  const [a, b, c] = scored.slice(-3);
  if (!(a.score > b.score && b.score > c.score)) return null;

  const drop = Math.round(a.score - c.score);
  if (drop < DECLINE_MIN_DROP) return null;

  return {
    kind:     'quality_decline',
    severity: drop >= 20 ? 'high' : 'watch',
    headline: 'Writing quality has fallen three weeks running',
    evidence: `week ${a.weekNumber} ${Math.round(a.score)} → week ${b.weekNumber} ${Math.round(b.score)} → week ${c.weekNumber} ${Math.round(c.score)} (down ${drop})`,
  };
}

/**
 * A week that reads like one of their own earlier weeks.
 *
 * The plagiarism service already computes this against a corpus that includes
 * the student's own prior entries, so nothing new is calculated here — it is
 * simply never surfaced as a pattern. Reported as similarity, never as
 * misconduct: a genuinely repetitive placement produces repetitive entries,
 * and that is a conversation, not an allegation.
 */
const REPETITION_THRESHOLD = 0.82;

function repetition(weeks: SignalWeek[]): ProgressSignal | null {
  const flagged = weeks
    .map((w) => {
      const p = w.plagiarism as { max_similarity?: unknown; checked?: unknown } | null;
      if (!p || typeof p !== 'object' || p.checked !== true) return null;
      const sim = toQualityNumber(p.max_similarity);
      // The scorer's helper coerces Decimals and strings; similarity is 0–1,
      // so anything outside that is unreadable rather than zero.
      if (sim === null || sim < 0 || sim > 1) return null;
      return { weekNumber: w.weekNumber, sim };
    })
    .filter((x): x is { weekNumber: number; sim: number } => x !== null)
    .filter((x) => x.sim >= REPETITION_THRESHOLD);

  if (flagged.length === 0) return null;

  const worst = flagged.reduce((m, x) => (x.sim > m.sim ? x : m));
  return {
    kind:     'repetition',
    severity: flagged.length >= 2 ? 'high' : 'watch',
    headline: flagged.length >= 2
      ? `${flagged.length} weeks closely resemble earlier ones`
      : 'One week closely resembles an earlier one',
    evidence: `week ${worst.weekNumber} at ${Math.round(worst.sim * 100)}% similarity — worth comparing side by side, similarity is not a verdict`,
  };
}

/**
 * Work that has stopped broadening.
 *
 * Compares the competency areas in the most recent three assessed weeks
 * against everything before them. Needs at least four weeks of tags, because
 * with three you are comparing a week to itself.
 */
function narrowingExposure(weeks: SignalWeek[]): ProgressSignal | null {
  const tagged = weeks
    .filter((w) => w.competencyTags.length > 0)
    .sort((a, b) => a.weekNumber - b.weekNumber);
  if (tagged.length < 4) return null;

  const recent = tagged.slice(-3);
  const earlier = tagged.slice(0, -3);
  if (earlier.length === 0) return null;

  const setOf = (ws: SignalWeek[]) =>
    new Set(ws.flatMap((w) => w.competencyTags.map((t) => t.trim().toLowerCase())).filter(Boolean));

  const before = setOf(earlier);
  const now    = setOf(recent);
  if (before.size === 0 || now.size >= before.size) return null;

  // Halved, or down to a single area. A drop from 6 to 5 is not a story.
  const halved = now.size * 2 <= before.size;
  if (!halved && now.size > 1) return null;

  return {
    kind:     'narrowing_exposure',
    severity: now.size <= 1 ? 'high' : 'watch',
    headline: 'The range of work has narrowed',
    evidence: `${before.size} competency area${before.size === 1 ? '' : 's'} across weeks ${earlier[0].weekNumber}–${earlier[earlier.length - 1].weekNumber}, ${now.size} across weeks ${recent[0].weekNumber}–${recent[recent.length - 1].weekNumber}`,
  };
}

/**
 * Everything written up against the deadline.
 *
 * Not misconduct and not late — these weeks were submitted on time. It means
 * the logbook is being reconstructed from memory at the end rather than kept
 * as work happens, which is what the reflection is for and why the entries
 * thin out. Worth a word, never a penalty.
 */
const DEADLINE_WINDOW_HOURS = 6;

function deadlineOnly(weeks: SignalWeek[]): ProgressSignal | null {
  const timed = weeks.filter((w) => w.submittedAt !== null && w.periodEnd !== null);
  if (timed.length < 3) return null;

  const nearDeadline = timed.filter((w) => {
    const gapHours = (w.periodEnd!.getTime() - w.submittedAt!.getTime()) / 3_600_000;
    // Inside the window and not after the deadline — lateness is a different
    // signal, already shown on the entry itself.
    return gapHours >= 0 && gapHours <= DEADLINE_WINDOW_HOURS;
  });

  if (nearDeadline.length < timed.length) return null;

  return {
    kind:     'deadline_only',
    severity: 'watch',
    headline: 'Every week is written up against the deadline',
    evidence: `all ${timed.length} submitted weeks landed within ${DEADLINE_WINDOW_HOURS} hours of the cut-off`,
  };
}

/**
 * Activities full, reflection empty.
 *
 * Compared against the cohort rather than a fixed number: what counts as thin
 * depends on how this cohort writes, and a hard word count would flag an
 * entire year group the moment the prompt changed.
 */
const THIN_REFLECTION_RATIO = 0.4;

function thinReflection(weeks: SignalWeek[], cohortMeanWords: number | null): ProgressSignal | null {
  if (cohortMeanWords === null || cohortMeanWords <= 0) return null;

  const submitted = weeks.filter((w) => w.submittedAt !== null);
  if (submitted.length < 3) return null;

  const mine = submitted.reduce((sum, w) => sum + w.reflectionWords, 0) / submitted.length;
  if (mine >= cohortMeanWords * THIN_REFLECTION_RATIO) return null;

  return {
    kind:     'thin_reflection',
    severity: mine === 0 ? 'high' : 'watch',
    headline: mine === 0
      ? 'Reflection is being left empty'
      : 'Reflection is much shorter than the cohort',
    evidence: `${Math.round(mine)} words per week against a cohort average of ${Math.round(cohortMeanWords)}`,
  };
}

/**
 * All signals for one student, most serious first.
 *
 * `cohortMeanWords` is passed in rather than computed here because it is a
 * property of the cohort, not of the student — computing it per student would
 * compare each of them against themselves.
 */
export function signalsFor(weeks: SignalWeek[], cohortMeanWords: number | null): ProgressSignal[] {
  const found = [
    qualityDecline(weeks),
    repetition(weeks),
    narrowingExposure(weeks),
    deadlineOnly(weeks),
    thinReflection(weeks, cohortMeanWords),
  ].filter((s): s is ProgressSignal => s !== null);

  // Deterministic: severity, then kind, so the page does not reshuffle itself
  // between refreshes and look untrustworthy.
  const rank = { high: 0, watch: 1 } as const;
  return found.sort((a, b) => rank[a.severity] - rank[b.severity] || a.kind.localeCompare(b.kind));
}

/** Words in a reflection, counted the same way for everyone. */
export function countWords(...parts: (string | null | undefined)[]): number {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

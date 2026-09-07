import { getStudentDashboard } from '../student/student.service';
import { logger } from '../../config/logger';

/**
 * Facts about the student asking, for the assistant to answer from.
 *
 * The assistant could recite the regulations and nothing else. Asked the first
 * question a student actually asks — "how many days have I logged?", "what week
 * am I on?", "who is my supervisor?" — it had to say it did not know, while the
 * answer sat one table away on their own dashboard.
 *
 * The division of labour is the same one the enrichment path uses: **the system
 * of record computes, the model phrases**. Every number here is the same figure
 * the dashboard renders, produced by the same function, so the assistant cannot
 * quote a progress percentage that disagrees with the page the student is
 * looking at. The model is given no arithmetic to do.
 *
 * Scoped to the authenticated student and built from their own id only —
 * nothing about the caller is taken from the request body.
 */

/**
 * How long the record may take before the assistant answers without it.
 *
 * This runs BEFORE the SSE headers go out, so a slow build does not degrade the
 * answer — it delays the whole reply, and the caller gives up and shows
 * "assistant unavailable" for what is really a slow dashboard query. The record
 * is an enhancement; the regulations answer is the product. Two seconds, then
 * proceed without it.
 */
const CONTEXT_TIMEOUT_MS = 2_000;

function line(label: string, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `${label}: ${value}`;
}

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * The record, or an empty string if it cannot be produced quickly. Never
 * rejects, never blocks the reply for more than `CONTEXT_TIMEOUT_MS`.
 */
export async function buildStudentContext(studentId: string): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      buildRecord(studentId),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => {
          logger.warn('Chat: student record timed out; answering without it', { studentId });
          resolve('');
        }, CONTEXT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    // The losing promise keeps running otherwise, and the handle keeps the
    // process alive in tests.
    if (timer) clearTimeout(timer);
  }
}

async function buildRecord(studentId: string): Promise<string> {
  let d: Awaited<ReturnType<typeof getStudentDashboard>>;
  try {
    d = await getStudentDashboard(studentId);
  } catch (err) {
    // Fail-open, like every other AI path: an assistant that can still answer
    // from the regulations beats one that refuses because a figure was
    // unavailable.
    logger.warn('Chat: could not build student context', {
      err: err instanceof Error ? err.message : String(err),
    });
    return '';
  }

  if (!d.hasActivePlacement) {
    return 'The student has no active placement right now, so they have no logbook '
      + 'to fill in yet and no supervisor assigned. If they ask about their own '
      + 'progress, say that and point them at the programme coordinator.';
  }

  const parts = [
    line('Programme', d.profile?.programme),
    line('Department', d.profile?.department),
    line('Current week', d.week ? `${d.week.current} of ${d.week.total}` : null),
    line('Weeks submitted', `${d.logsSubmitted} of ${d.expectedLogs}`),
    line('Overall progress', `${d.completionPct}% (days logged out of working days due so far)`),
    // Advisory and clearly labelled as such: the student must never read this
    // as a mark, and the assistant is told the same in the prompt.
    line('Average AI writing-quality score (advisory only, not a grade)', d.avgQualityScore),
    line('Hours logged', d.hours ? `${d.hours.logged} of ${d.hours.expected} expected so far` : null),
    line('Tasks completed', `${d.tasks.done} of ${d.tasks.total}`),
    line('Academic supervisor', d.supervisors?.academic?.name),
    line('Company supervisor', d.supervisors?.company?.name),
    line('Host organisation', d.supervisors?.company?.organization),
    line('Next scheduled review', formatDate(d.nextReview?.scheduledAt)),
  ].filter((l): l is string => l !== null);

  // Week states are what a student most often needs to act on: a returned week
  // is waiting for THEM, and saying so is more useful than any total.
  const b = d.statusBreakdown as Record<string, number> | undefined;
  if (b) {
    const states = Object.entries(b)
      .filter(([, n]) => typeof n === 'number' && n > 0)
      .map(([k, n]) => `${n} ${k}`);
    if (states.length) parts.push(`Logbook weeks by state: ${states.join(', ')}`);
    if (b.returned > 0) {
      parts.push(
        `${b.returned} week(s) were RETURNED by the supervisor and are waiting for `
        + 'the student to revise and resubmit.',
      );
    }
  }

  if (d.objectives?.length) {
    parts.push(
      'Learning objectives: '
      + d.objectives
        .map((o) => `"${o.title}" (${o.confirmedEntryCount} confirmed entries)`)
        .join('; '),
    );
  }

  return parts.join('\n');
}

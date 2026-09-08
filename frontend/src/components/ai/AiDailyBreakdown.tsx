import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The AI's per-activity verdicts, grouped by the day the work was done.
 *
 * The engine already judges every activity separately — relevance, competency
 * themes and a one-clause reason — and the enrichment worker already sends it
 * each activity's date. Only the display flattened all of that into a single
 * weekly block. So this is a regrouping of what exists: no new AI call, no new
 * column, and nothing here is computed that the model did not actually say.
 *
 * What is NOT shown per day: the four quality dimensions. The rubric is scored
 * once for the week as a whole, so splitting it across days would be inventing
 * numbers. Those stay on the weekly view where they belong.
 */

/** One entry of `summary.activity_relevance[]` (ai/routers/enrich.py:398). */
export interface ActivityVerdict {
  description: string;
  relevance?:  number;
  on_topic?:   boolean;
  themes?:     string[];
  reason?:     string;
}

export interface DatedActivity {
  activityDate: string;
  description:  string;
}

/**
 * The engine returns one verdict per activity, in the order it was sent
 * (`for i, activity in enumerate(activities)`, ai/routers/enrich.py:391), and
 * both the worker and every read order by `activityDate`. So the join is
 * POSITIONAL — not by text, because the engine truncates each description to
 * 140 characters (enrich.py:400) and a longer activity would never match.
 *
 * Position is only safe while the two lists still describe the same activities,
 * and two things can break that: a student editing the week after enrichment
 * ran, and `orderBy activityDate` having no tiebreak, so two activities on the
 * same day may come back in either order.
 *
 * Hence this check. Attributing one activity's verdict to another is worse than
 * showing no daily view at all, so a mismatch hides the breakdown rather than
 * guessing.
 */
export function verdictsAlign(
  activities: DatedActivity[],
  verdicts:   ActivityVerdict[],
): boolean {
  if (activities.length === 0 || activities.length !== verdicts.length) return false;
  return activities.every((a, i) => {
    const seen = verdicts[i]?.description;
    if (typeof seen !== 'string') return false;
    // Compare on the truncated prefix, which is all the engine kept.
    return a.description.slice(0, seen.length) === seen;
  });
}

const DAY_FMT: Intl.DateTimeFormatOptions = {
  weekday: 'short', day: 'numeric', month: 'short',
};

function relevancePct(v: unknown): number | null {
  const n = Number(v);
  // 0–1 from the classifier. Anything else is not renderable, and is skipped
  // rather than shown as 0 — an unscored activity is not an irrelevant one.
  return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 100) : null;
}

export default function AiDailyBreakdown({
  activities,
  verdicts,
}: {
  activities: DatedActivity[];
  verdicts:   ActivityVerdict[];
}) {
  if (verdicts.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        This week was assessed before per-activity detail was recorded, so there is no
        daily breakdown for it.
      </p>
    );
  }

  if (!verdictsAlign(activities, verdicts)) {
    return (
      <p className="text-xs text-ink-muted">
        The activities changed after this assessment ran, so the AI's per-activity notes
        can no longer be matched to specific days. The weekly view is still accurate.
      </p>
    );
  }

  // Grouped in the order the days arrive, which is already ascending by date.
  const byDay = new Map<string, { activity: DatedActivity; verdict: ActivityVerdict }[]>();
  activities.forEach((activity, i) => {
    const list = byDay.get(activity.activityDate) ?? [];
    list.push({ activity, verdict: verdicts[i] });
    byDay.set(activity.activityDate, list);
  });

  return (
    <div className="space-y-3">
      {[...byDay.entries()].map(([date, rows]) => (
        <div key={date}>
          <p className="mb-1.5 text-xs font-semibold text-ink-secondary">
            {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', DAY_FMT)}
          </p>

          <ul className="space-y-2">
            {rows.map(({ activity, verdict }, i) => {
              const pct = relevancePct(verdict.relevance);
              const onTopic = verdict.on_topic === true;

              return (
                <li key={`${date}-${i}`} className="rounded-lg bg-surface-sunken px-3 py-2">
                  <div className="flex items-start gap-2">
                    {/* The icon repeats on_topic rather than deriving it from
                        the percentage: the threshold is the engine's
                        (enrich.py:402), not this component's to reinvent. */}
                    <span className={cn('mt-0.5 shrink-0', onTopic ? 'text-ok' : 'text-warn')}>
                      {onTopic
                        ? <CircleCheck className="h-3.5 w-3.5" />
                        : <CircleAlert className="h-3.5 w-3.5" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{activity.description}</p>

                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
                        {pct !== null && (
                          <span className="font-semibold">CS relevance {pct}%</span>
                        )}
                        {(verdict.themes ?? []).map((t) => (
                          <span key={t} className="rounded bg-brand-soft px-1.5 py-0.5 text-brand-ink">
                            {t.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </p>

                      {/* Empty on the keyword fallback — its absence is itself
                          the signal that the model did not run. */}
                      {verdict.reason && (
                        <p className="mt-1 text-[11px] italic leading-relaxed text-ink-secondary">
                          {verdict.reason}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, CheckCircle2, AlertCircle, Clock, Send, RotateCcw, Sparkles,
  CalendarDays, ListChecks, CircleDashed,
} from 'lucide-react';
import { useMyPlacement } from '@/hooks/usePlacements';
import { useEntries, useEntry, type EntryStatus } from '@/hooks/useEntries';
import { useSiwesCalendar } from '@/hooks/useSiwes';
import { buildSchedule, fmtRange, SCHEDULE_WEEKS } from '@/lib/schedule';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/Bits';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';

/**
 * The student's submission history.
 *
 * Every week of the programme is listed, not only the ones that already have a
 * row: a week nobody has opened has no `logbook_entry`, and showing only what
 * exists made a student who had started nothing see an empty page rather than
 * their five upcoming weeks. The rail comes from the cohort's configured span
 * (`calendar.totalWeeks` → `durationWeeks`), so this page and the logbook can
 * never disagree about how long the programme is.
 */

type WeekState = EntryStatus | 'pending';

const STATE_META: Record<WeekState, { label: string; tone: BadgeTone; Icon: React.ElementType }> = {
  draft:        { label: 'Draft',        tone: 'warn',    Icon: Clock },
  submitted:    { label: 'Submitted',    tone: 'brand',   Icon: Send },
  returned:     { label: 'Returned',     tone: 'danger',  Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', tone: 'ok',      Icon: CheckCircle2 },
  pending:      { label: 'Pending',      tone: 'neutral', Icon: CircleDashed },
};

/** The week chip on the left of each row — W1, W2 … tinted by state. */
const CHIP_CLS: Record<WeekState, string> = {
  draft:        'border-warn bg-warn-soft text-warn',
  submitted:    'border-brand bg-brand-soft text-brand-ink',
  returned:     'border-danger bg-danger-soft text-danger',
  acknowledged: 'border-ok bg-ok-soft text-ok',
  pending:      'border-line bg-surface-sunken text-ink-muted',
};

/**
 * The outcome line on the right of each row.
 *
 * The reference design puts a written verdict here ("Well done!", "Great
 * progress!"). That text is a supervisor's or the model's, and it lives on the
 * entry — which costs a fetch per row. So the headline states what the STATUS
 * means and the detail panel, which does fetch, carries the actual words.
 */
function outcomeOf(state: WeekState, periodEnd: string): {
  Icon: React.ElementType; tone: string; head: string; sub: string;
} {
  switch (state) {
    case 'acknowledged':
      return { Icon: CheckCircle2, tone: 'text-ok', head: 'Acknowledged', sub: 'Your supervisor has signed this week off.' };
    case 'returned':
      return { Icon: AlertCircle, tone: 'text-danger', head: 'Needs your attention', sub: 'Open the feedback and revise it.' };
    case 'submitted':
      return { Icon: Send, tone: 'text-brand-ink', head: 'With your supervisor', sub: 'Waiting on their review.' };
    case 'draft':
      return { Icon: Clock, tone: 'text-warn', head: 'Started, not sent', sub: `Due ${fmtDay(periodEnd)}.` };
    default:
      return { Icon: Clock, tone: 'text-ink-muted', head: 'Upcoming', sub: `Due ${fmtDay(periodEnd)}.` };
  }
}

function fmtDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtStamp(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

const FLOW_STEPS = ['Submitted', 'Under review', 'Decision'];

function FlowTracker({ state }: { state: WeekState }) {
  const reached = state === 'draft' || state === 'pending' ? -1 : state === 'submitted' ? 1 : 2;
  const flaggedDecision = state === 'returned';

  return (
    <div className="flex items-center gap-0">
      {FLOW_STEPS.map((s, i) => {
        const done = i <= reached;
        const decisionFlagged = i === 2 && done && flaggedDecision;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`grid h-5 w-5 place-items-center rounded-full border-2 ${
                done
                  ? decisionFlagged ? 'border-danger bg-danger-soft' : 'border-brand bg-brand-soft'
                  : 'border-line bg-surface-sunken'
              }`}>
                {done && (decisionFlagged
                  ? <AlertCircle className="h-3 w-3 text-danger" />
                  : <CheckCircle2 className="h-3 w-3 text-brand-ink" />)}
              </div>
              <span className="mt-1 hidden whitespace-nowrap text-[9px] text-ink-secondary sm:block">{s}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`mx-1 h-px w-10 sm:w-16 ${i < reached ? 'bg-brand' : 'bg-line'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Expanded detail — fetches the full entry for the supervisor's note + AI summary. */
function EntryDetail({ entryId, state }: { entryId: string; state: WeekState }) {
  const { data: detail, isLoading } = useEntry(entryId);

  const decisionEvent = detail?.events
    ? [...detail.events].reverse().find((e) => ['acknowledged', 'returned'].includes(e.toStatus))
    : undefined;
  const aiSummary = detail?.assessments?.find((a) => a.summary != null)?.summary;
  const summaryText = typeof aiSummary === 'string' ? aiSummary : null;

  return (
    <div className="border-t border-line px-5 pb-5 pt-5">
      <div className="mb-4 flex items-center justify-center">
        <FlowTracker state={state} />
      </div>

      {isLoading ? (
        <SkeletonRows rows={2} />
      ) : (
        <>
          {decisionEvent?.comment && (
            <div className="mb-3 rounded-lg border border-line bg-surface-sunken px-4 py-3">
              <p className="mb-1 text-xs font-medium text-ink-muted">Supervisor note</p>
              <p className="text-xs leading-relaxed text-ink-secondary">"{decisionEvent.comment}"</p>
            </div>
          )}
          {summaryText && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-surface-sunken px-4 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" />
              <p className="text-xs leading-relaxed text-ink-secondary">{summaryText}</p>
            </div>
          )}
          {!decisionEvent?.comment && !summaryText && (
            <p className="mb-3 text-xs text-ink-muted">
              No written feedback on this week yet.
            </p>
          )}
          <Link
            to="/student/logbook"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink hover:underline"
          >
            Open in logbook <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}

export default function SubmissionHistory() {
  const { placement: activePlacement, isLoading: placementsLoading } = useMyPlacement();
  const { data: entries = [], isLoading: entriesLoading } = useEntries(activePlacement?.id);
  const { data: calendar } = useSiwesCalendar(activePlacement?.id);
  const [openId, setOpenId] = useState<string | null>(null);

  const totalWeeks = calendar?.totalWeeks ?? SCHEDULE_WEEKS;

  // Every week of the programme, with the entry (if any) attached.
  const weeks = useMemo(() => {
    const byNumber = new Map(entries.map((e) => [e.weekNumber, e]));
    // chainStart, not the placement's own startDate — see buildSchedule.
    const schedule = buildSchedule(calendar?.chainStart ?? activePlacement?.startDate ?? null, totalWeeks);

    // A placement with no start date yet has no schedule; fall back to whatever
    // entries exist so the page is never blank when data does exist.
    const rows = schedule.length > 0
      ? schedule.map((w) => ({
          weekNumber:  w.weekNumber,
          periodStart: w.periodStart,
          periodEnd:   w.periodEnd,
          entry:       byNumber.get(w.weekNumber),
        }))
      : entries.map((e) => ({
          weekNumber: e.weekNumber, periodStart: e.periodStart, periodEnd: e.periodEnd, entry: e,
        }));

    return rows
      .map((r) => ({ ...r, state: (r.entry?.status ?? 'pending') as WeekState }))
      // Weeks that have happened first, newest at the top; upcoming ones after.
      .sort((a, b) => {
        const aLive = a.state !== 'pending' ? 1 : 0;
        const bLive = b.state !== 'pending' ? 1 : 0;
        return bLive - aLive || (aLive ? b.weekNumber - a.weekNumber : a.weekNumber - b.weekNumber);
      });
  }, [entries, calendar?.chainStart, activePlacement?.startDate, totalWeeks]);

  if (placementsLoading || entriesLoading) {
    return <div className="mx-auto max-w-[1500px] p-4 sm:p-6"><Card><SkeletonRows rows={6} /></Card></div>;
  }

  const submitted = entries.filter((e) => e.submittedAt != null).length;
  const attention = entries.filter((e) => e.status === 'returned').length;
  const remaining = Math.max(0, totalWeeks - submitted);
  const pct = totalWeeks > 0 ? Math.round((submitted / totalWeeks) * 100) : 0;

  // The soonest week that has not been handed in — the only deadline that can
  // be stated as a fact rather than a guess.
  const nextDue = weeks
    .filter((w) => w.entry?.submittedAt == null)
    .sort((a, b) => a.weekNumber - b.weekNumber)[0];

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Submissions</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Track your programme progress and submissions
            {activePlacement?.company?.name ? ` · ${activePlacement.company.name}` : ''}
          </p>
        </header>

        {/* ── Overall progress ─────────────────────────────── */}
        <Card>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-ink">Overall programme progress</span>
                <span className="text-xs text-ink-muted">
                  {submitted} of {totalWeeks} week{totalWeeks === 1 ? '' : 's'} submitted
                </span>
              </div>
              <ProgressBar value={pct} label={`${pct}% of the programme submitted`} />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand" />Submitted ({submitted})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger" />Needs attention ({attention})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-line-strong" />Remaining ({remaining})
                </span>
              </div>
            </div>

            <ProgressRing pct={pct} />
          </div>
        </Card>

        {/* ── Weekly submissions ───────────────────────────── */}
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Weekly submissions</h2>

          {weeks.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No weeks to show yet"
                hint="Your weekly entries appear here once your placement start date is on record."
              />
            </Card>
          ) : (
            <div className="space-y-2.5">
              {weeks.map((w) => {
                const isOpen = w.entry != null && openId === w.entry.id;
                const meta = STATE_META[w.state];
                const outcome = outcomeOf(w.state, w.periodEnd);

                return (
                  <div
                    key={w.weekNumber}
                    className={`overflow-hidden rounded-card border bg-surface shadow-card transition-colors ${
                      isOpen ? 'border-brand' : 'border-line'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => w.entry && setOpenId(isOpen ? null : w.entry.id)}
                      disabled={!w.entry}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors enabled:hover:bg-surface-sunken disabled:cursor-default"
                    >
                      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${CHIP_CLS[w.state]}`}>
                        <span className="text-xs font-bold">W{w.weekNumber}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">Week {w.weekNumber}</span>
                          <Badge tone={meta.tone} icon={meta.Icon}>{meta.label}</Badge>
                        </div>
                        <span className="text-xs text-ink-muted">
                          {w.entry?.submittedAt
                            ? `Submitted on ${fmtStamp(w.entry.submittedAt)}`
                            : fmtRange(w.periodStart, w.periodEnd)}
                        </span>
                      </div>

                      <div className="hidden min-w-0 shrink-0 items-start gap-2 border-l border-line pl-4 md:flex md:w-56">
                        <outcome.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${outcome.tone}`} />
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${outcome.tone}`}>{outcome.head}</span>
                          <span className="block text-xs text-ink-muted">{outcome.sub}</span>
                        </span>
                      </div>

                      {w.entry && (
                        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      )}
                    </button>

                    {isOpen && w.entry && <EntryDetail entryId={w.entry.id} state={w.state} />}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Right rail ─────────────────────────────────────── */}
      <aside className="space-y-5">
        <Card>
          <CardHeader title="Submission summary" />
          <ul className="space-y-3">
            <SummaryRow icon={CheckCircle2} tone="text-ok"        label="Submitted"      value={submitted} />
            <SummaryRow icon={AlertCircle}  tone="text-danger"    label="Needs attention" value={attention} />
            <SummaryRow icon={Clock}        tone="text-ink-muted" label="Remaining"      value={remaining} />
            <SummaryRow icon={ListChecks}   tone="text-brand-ink" label="Total weeks"    value={totalWeeks} />
          </ul>
        </Card>

        <Card>
          <CardHeader title="Next deadline" />
          {nextDue ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarDays className="h-4 w-4 text-brand-ink" />
                Week {nextDue.weekNumber} submission
              </p>
              <p className="mt-1 text-xs text-ink-muted">{fmtDay(nextDue.periodEnd)}</p>
              <Link
                to="/student/logbook"
                className="mt-4 block rounded-lg border border-line px-3 py-2.5 text-center text-xs font-semibold text-ink-secondary transition-colors hover:border-brand hover:text-brand-ink"
              >
                Open my logbook
              </Link>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">
              Every week of the programme has been handed in. Nothing is outstanding.
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}

/**
 * The completion ring.
 *
 * Deliberately not `DonutStat`: that component pairs its chart with its own
 * legend at `sm:flex-row`, and a viewport breakpoint knows nothing about the
 * 190px column it was being asked to sit in — the legend overflowed the card
 * and collided with the rail. The dot legend beside the progress bar already
 * names the three slices, so this draws the ring alone.
 */
function ProgressRing({ pct }: { pct: number }) {
  return (
    <div
      className="grid h-[150px] w-[150px] shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(var(--brand) ${pct * 3.6}deg, var(--surface-sunken) 0deg)` }}
      role="img"
      aria-label={`${pct}% of the programme submitted`}
    >
      <div className="grid h-[112px] w-[112px] place-items-center rounded-full bg-surface text-center">
        <div>
          <p className="text-2xl font-bold text-ink">{pct}%</p>
          <p className="text-[11px] text-ink-muted">Complete</p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon: Icon, tone, label, value,
}: { icon: React.ElementType; tone: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-2.5">
      <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary">{label}</span>
      <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs font-bold text-ink">{value}</span>
    </li>
  );
}

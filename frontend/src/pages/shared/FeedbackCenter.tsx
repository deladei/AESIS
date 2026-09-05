import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Loader2, CheckCircle2, RotateCcw, Search, MessageSquare,
  ClipboardCheck, Video, Wand2, TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedbackInterns, type FeedbackIntern } from '@/hooks/useDashboard';
import { useMyPlacements } from '@/hooks/usePlacements';
import {
  useEntries, useEntry, useAcknowledgeEntry, useReturnEntry,
} from '@/hooks/useEntries';
import { ChatThread } from '@/components/messaging/ChatThread';
import ScheduleCallCard from '@/components/messaging/ScheduleCallCard';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar, ProgressBar, NoValue } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { FieldError } from '@/components/shared/FieldError';
import { freeText } from '@/lib/validation';
import { cn } from '@/lib/utils';

const FEEDBACK_MAX = 5000;
const FEEDBACK_TEXT = freeText(FEEDBACK_MAX, 'Feedback').min(10, 'Feedback must be at least 10 characters');

/**
 * Feedback & Mentorship Centre.
 *
 * Reviewer mode (supervisor / admin / coordinator): pick an intern, see where
 * they are, talk to them, and record the formal decision on their latest week.
 * That decision goes through the ENTRIES pipeline — acknowledge with a score,
 * or return with a comment — which is the workflow the student's logbook
 * actually reads. It used to post to `/logbook/submissions/:id/feedback`, the
 * retired pipeline, so feedback written here could never reach the student.
 *
 * The AI Feedback Studio shows the engine's own draft for the reviewer to edit
 * before sending. It is never submitted on its own: a human presses the button
 * and owns every word that reaches the student.
 */
export default function FeedbackCenter() {
  const { user } = useAuth();
  const isReviewer = !!user && ['academic_supervisor', 'admin', 'coordinator'].includes(user.role);
  return isReviewer ? <ReviewerView /> : <StudentView />;
}

/* ── Reviewer ────────────────────────────────────────────────── */

function Step({
  n, icon: Icon, title, hint, children, className,
}: {
  n: number; icon: React.ElementType; title: string; hint?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <Card className={className}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{n}. {title}</h2>
          {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ReviewerView() {
  const { user } = useAuth();
  const isReadOnlyChat = user?.role === 'coordinator';
  const { data: interns, isLoading, isError, refetch } = useFeedbackInterns();

  const acknowledge = useAcknowledgeEntry();
  const returnEntry = useReturnEntry();

  const [selectedId, setSelectedId]   = useState('');
  const [search, setSearch]           = useState('');
  const [rating, setRating]           = useState<number | null>(null);
  const [feedbackText, setFeedback]   = useState('');
  const [feedbackErr, setErr]         = useState<string | undefined>();
  const [done, setDone]               = useState<'acknowledged' | 'returned' | null>(null);

  const selected = useMemo(
    () => interns?.find(i => i.placementId === (selectedId || interns[0]?.placementId)),
    [interns, selectedId],
  );

  // Switching intern must not carry the previous one's draft or verdict across.
  useEffect(() => { setFeedback(''); setRating(null); setErr(undefined); setDone(null); },
    [selected?.placementId]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = interns ?? [];
    if (!q) return list;
    return list.filter(i =>
      i.name.toLowerCase().includes(q) || (i.company ?? '').toLowerCase().includes(q));
  }, [interns, search]);

  if (isLoading) return <div className="p-6"><SkeletonRows rows={6} /></div>;
  if (isError || !interns) {
    return (
      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <Card><ErrorState message="Couldn't load interns." onRetry={() => void refetch()} /></Card>
      </div>
    );
  }

  const entry = selected?.latestEntry ?? null;
  // A coordinator is read-only on the entries pipeline by policy — they never
  // transition a week — so the evaluation form is theirs to read, not to use.
  // Without this the buttons rendered and the API answered 403.
  const canDecide = user?.role === 'academic_supervisor' || user?.role === 'admin';
  const canReview = canDecide && !!entry?.canReceiveFeedback;
  const busy      = acknowledge.isPending || returnEntry.isPending;

  // How many of this reviewer's interns are waiting on them right now.
  const awaiting = interns.filter(i => i.latestEntry?.canReceiveFeedback).length;

  async function decide(action: 'acknowledge' | 'return') {
    if (!entry) return;
    const parsed = FEEDBACK_TEXT.safeParse(feedbackText);
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message); return; }
    if (action === 'acknowledge' && rating == null) {
      setErr('Pick an overall rating before acknowledging the week.');
      return;
    }
    setErr(undefined);

    try {
      if (action === 'acknowledge') {
        // The entries pipeline scores 0-100; the 1-5 dial is the reviewer's
        // scale, so it is converted once, here, rather than stored twice.
        await acknowledge.mutateAsync({
          entryId: entry.id,
          comment: feedbackText.trim(),
          score:   (rating ?? 0) * 20,
        });
        setDone('acknowledged');
      } else {
        await returnEntry.mutateAsync({ entryId: entry.id, comment: feedbackText.trim() });
        setDone('returned');
      }
      setFeedback('');
      setRating(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not record that decision.');
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Feedback Centre</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Provide structured feedback, evaluate performance and support intern growth.
          {awaiting > 0 && <> <strong className="font-semibold text-ink">{awaiting}</strong> awaiting your review.</>}
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0 space-y-5">
          {/* 1 ── pick an intern */}
          <Step n={1} icon={Search} title="Select intern"
            hint="Search your cohort, then see where they are before you write anything.">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                aria-label="Search interns"
                placeholder="Search interns by name or company…"
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
              />
            </label>

            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {matches.length === 0 ? (
                <p className="px-1 py-3 text-xs text-ink-muted">No interns match “{search}”.</p>
              ) : matches.map(i => (
                <InternRow
                  key={i.placementId} intern={i}
                  active={i.placementId === selected?.placementId}
                  onSelect={() => setSelectedId(i.placementId)}
                />
              ))}
            </div>

            {selected && <ProgressGlance intern={selected} />}
          </Step>

          {/* 2 ── formal evaluation */}
          <Step n={2} icon={ClipboardCheck} title="Formal evaluation"
            hint={canDecide
              ? 'Acknowledging closes the week and is final. Returning sends it back for revision — either way the intern is notified and sees exactly what you wrote.'
              : 'Coordinators oversee but never decide a week — that belongs to the intern\'s own academic supervisor.'}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {entry ? (
                <>
                  <Badge tone={canReview ? 'warn' : 'neutral'}>
                    Week {entry.weekNumber} · {entry.status.replace(/^./, c => c.toUpperCase())}
                  </Badge>
                  {entry.qualityScore != null && (
                    <Badge tone="info">AI quality {entry.qualityScore}/100 · advisory</Badge>
                  )}
                </>
              ) : (
                <Badge tone="neutral">No weeks logged yet</Badge>
              )}
            </div>

            {!entry ? (
              <EmptyState
                title="Nothing to evaluate yet"
                hint="This intern has not logged a week. Their first submission will appear here."
                className="py-8"
              />
            ) : (
              <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
                <fieldset disabled={!canReview || busy} className="space-y-5 disabled:opacity-60">
                  <div>
                    <span className="mb-2 block text-sm font-medium text-ink-secondary">Overall rating</span>
                    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Overall rating">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n} type="button" role="radio" aria-checked={n === rating}
                          onClick={() => setRating(n)}
                          className={cn(
                            'rounded-lg border py-2 text-sm font-semibold transition-colors',
                            n === rating
                              ? 'border-brand bg-brand text-ink-inverse'
                              : 'border-line text-ink hover:border-brand',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Recorded on the week as a score out of 100 — {rating ? `${rating} of 5 is ${rating * 20}/100` : '1 of 5 is 20/100'}.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="feedbackText" className="mb-2 block text-sm font-medium text-ink-secondary">
                      Feedback to the intern
                    </label>
                    <textarea
                      id="feedbackText" rows={6} value={feedbackText} maxLength={FEEDBACK_MAX}
                      aria-invalid={!!feedbackErr}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder={canReview
                        ? 'What went well, what to change, and what to do next week…'
                        : canDecide
                        ? 'This intern has no week awaiting your review.'
                        : 'Read-only: a week is decided by the intern\'s academic supervisor.'}
                      className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <FieldError message={feedbackErr} />
                      <span className="ml-auto shrink-0 text-[11px] text-ink-muted">
                        {feedbackText.trim().length}/{FEEDBACK_MAX}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button" onClick={() => decide('return')}
                      disabled={!feedbackText.trim() || busy}
                      className="inline-flex items-center gap-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5 text-sm font-semibold text-warn transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" /> Return for revision
                    </button>
                    <button
                      type="button" onClick={() => decide('acknowledge')}
                      disabled={!feedbackText.trim() || busy}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Acknowledge week
                    </button>
                  </div>
                </fieldset>

                {done && (
                  <p className="flex items-center gap-2 text-sm font-medium text-ok">
                    <CheckCircle2 className="h-4 w-4" />
                    {done === 'acknowledged'
                      ? 'Week acknowledged and scored. The intern has been notified.'
                      : 'Week returned for revision. The intern has been notified.'}
                  </p>
                )}
              </form>
            )}
          </Step>

          {/* 3 ── AI studio */}
          <Step n={3} icon={Wand2} title="AI feedback studio"
            hint="The engine's own draft and rubric for this week. Advisory: edit it, then you press the button — nothing here is sent on its own.">
            <AiStudio entry={entry} onUse={(text) => setFeedback(text)} />
          </Step>

          {/* 4 ── call */}
          {user?.role === 'admin' && selected && (
            <Step n={4} icon={Video} title="Schedule a video call"
              hint="Optional — talk it through with the intern.">
              <ScheduleCallCard placementId={selected.placementId} internName={selected.name} />
            </Step>
          )}
        </div>

        {/* Conversation rail */}
        <aside>
          <Card padded={false} className="flex h-[calc(100vh-9rem)] min-h-[30rem] flex-col overflow-hidden xl:sticky xl:top-6">
            <div className="shrink-0 border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <MessageSquare className="h-4 w-4 text-brand-ink" /> Feedback conversation
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                {selected ? `${selected.name}${selected.company ? ` · ${selected.company}` : ''}` : 'Pick an intern to start'}
                {isReadOnlyChat && ' · read-only for coordinators'}
              </p>
            </div>
            {selected ? (
              <ChatThread
                placementId={selected.placementId}
                title={selected.name}
                subtitle={selected.company ?? 'Mentorship chat'}
                disabled={isReadOnlyChat}
              />
            ) : (
              <EmptyState
                icon={MessageSquare}
                title="No intern selected"
                hint="Pick someone above to open the conversation."
                className="flex-1"
              />
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function InternRow({
  intern, active, onSelect,
}: { intern: FeedbackIntern; active: boolean; onSelect: () => void }) {
  const waiting = intern.latestEntry?.canReceiveFeedback;
  return (
    <button
      type="button" onClick={onSelect} aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-brand-soft' : 'hover:bg-surface-sunken',
      )}
    >
      <InitialsAvatar name={intern.name} size={30} />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold', active ? 'text-brand-ink' : 'text-ink')}>
          {intern.name}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {intern.company ?? 'No company'}
          {intern.latestEntry && ` · Week ${intern.latestEntry.weekNumber}`}
        </span>
      </span>
      {waiting && <Badge tone="warn">Awaiting you</Badge>}
    </button>
  );
}

/** Where this intern is, before a word of feedback is written. */
function ProgressGlance({ intern }: { intern: FeedbackIntern }) {
  const p = intern.progress;
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-ink">Progress at a glance</span>
        <span className="text-ink-muted">
          {p.pct != null ? `${p.pct}%` : <NoValue title="No week has come due yet" />}
        </span>
      </div>
      <ProgressBar value={p.pct} tone="ok" label={`${intern.name}: ${p.pct ?? 0}% of weeks due submitted`} />
      <p className="mt-1.5 text-xs text-ink-muted">
        {p.submittedWeeks} of {p.weeksDue} week{p.weeksDue === 1 ? '' : 's'} due submitted
        {' · '}{p.programmeWeeks}-week programme
      </p>
    </div>
  );
}

/**
 * The engine's draft and rubric for the selected week. Everything here is
 * advisory and labelled as such; the reviewer copies it into their own box and
 * edits before anything is sent.
 */
function AiStudio({
  entry, onUse,
}: { entry: FeedbackIntern['latestEntry']; onUse: (text: string) => void }) {
  if (!entry) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No week to analyse"
        hint="The studio fills in once this intern submits a week."
        className="py-8"
      />
    );
  }

  const draft = typeof entry.aiDraft?.text === 'string' ? entry.aiDraft.text : null;
  const summary = entry.aiSummary as { headline?: string; themes?: string[]; concerns?: string[] } | null;

  // The rubric, split into what went well and what did not. Dimensions are
  // whatever the engine wrote — never a fixed list this page invents.
  const dims = Object.entries(entry.quality ?? {})
    .filter(([k, v]) => k !== 'overall' && typeof v === 'number' && v >= 0 && v <= 100)
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: v as number }))
    .sort((a, b) => b.value - a.value);

  const strengths = dims.filter(d => d.value >= 70).slice(0, 3);
  const growth    = dims.filter(d => d.value < 70).slice(-3).reverse();

  if (!draft && !summary && dims.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="This week has not been assessed"
        hint="Enrichment is advisory and fails open — a week can be reviewed without it."
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary?.headline && (
        <p className="rounded-lg bg-surface-sunken px-4 py-3 text-sm italic text-ink-secondary">
          “{summary.headline}”
        </p>
      )}

      {(strengths.length > 0 || growth.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {strengths.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ok">
                <TrendingUp className="h-3.5 w-3.5" /> Strongest dimensions
              </p>
              <ul className="space-y-2">
                {strengths.map(d => <DimRow key={d.label} {...d} tone="ok" />)}
              </ul>
            </div>
          )}
          {growth.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold text-warn">Where to push</p>
              <ul className="space-y-2">
                {growth.map(d => <DimRow key={d.label} {...d} tone="warn" />)}
              </ul>
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-brand-ink">
              <Sparkles className="h-3.5 w-3.5" /> Suggested draft
            </p>
            <button
              type="button" onClick={() => onUse(draft)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-sunken"
            >
              Use as a starting point
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{draft}</p>
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Generated suggestions can be wrong and are never sent on their own — edit anything you use.
      </p>
    </div>
  );
}

function DimRow({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' }) {
  return (
    <li>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate capitalize text-ink">{label}</span>
        <span className="shrink-0 font-semibold text-ink-secondary">{value}</span>
      </div>
      <ProgressBar value={value} tone={tone} label={`${label}: ${value} of 100`} />
    </li>
  );
}

/* ── Student ─────────────────────────────────────────────────── */

/**
 * What the student actually received. Reads the same entries pipeline the
 * supervisor writes to — the decision comment lives on the append-only event,
 * which only the detail endpoint carries, so the three most recently decided
 * weeks are fetched in full (the route the dashboard takes).
 */
function StudentView() {
  const { data: placements, isLoading: pLoading } = useMyPlacements();
  const placementId = placements?.[0]?.id;
  const { data: entries = [], isLoading: eLoading } = useEntries(placementId);

  const decidedIds = [...entries]
    .filter(e => e.status === 'acknowledged' || e.status === 'returned')
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .slice(0, 3)
    .map(e => e.id);

  const fb0 = useEntry(decidedIds[0]);
  const fb1 = useEntry(decidedIds[1]);
  const fb2 = useEntry(decidedIds[2]);

  if (pLoading || (placementId && eLoading)) {
    return <div className="p-6"><SkeletonRows rows={5} /></div>;
  }

  const cards = [fb0.data, fb1.data, fb2.data].flatMap((entry) => {
    if (!entry) return [];
    const decision = [...(entry.events ?? [])]
      .reverse()
      .find(e => ['acknowledged', 'returned'].includes(e.toStatus) && !!e.comment);
    return decision ? [{ entry, decision }] : [];
  });

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Your feedback</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          What your supervisor said about each week, and a direct line to your mentors.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="min-w-0 space-y-4">
          {cards.length === 0 ? (
            <Card>
              <EmptyState
                icon={MessageSquare}
                title="No feedback yet"
                hint="It appears here once your supervisor has reviewed a week you submitted."
              />
            </Card>
          ) : cards.map(({ entry, decision }) => (
            <Card key={entry.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-ink">Week {entry.weekNumber}</h2>
                <Badge tone={decision.toStatus === 'acknowledged' ? 'ok' : 'warn'}>
                  {decision.toStatus === 'acknowledged' ? 'Acknowledged' : 'Returned for revision'}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
                {decision.comment}
              </p>
            </Card>
          ))}
        </div>

        <aside>
          <Card padded={false} className="flex h-[calc(100vh-9rem)] min-h-[28rem] flex-col overflow-hidden xl:sticky xl:top-6">
            <div className="shrink-0 border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <MessageSquare className="h-4 w-4 text-brand-ink" /> Messages
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">Your supervisor and the admin team</p>
            </div>
            <ChatThread
              placementId={placementId}
              title="Messages"
              subtitle="Your supervisor & admin team"
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, Flag, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedbackInterns } from '@/hooks/useDashboard';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions, useSubmitFeedback } from '@/hooks/useLogbook';
import { ChatThread } from '@/components/messaging/ChatThread';
import ScheduleCallCard from '@/components/messaging/ScheduleCallCard';
import { FieldError } from '@/components/shared/FieldError';
import { freeText } from '@/lib/validation';

// Mirrors logbook.schema's `feedbackText: min(10).max(5000)`.
const FEEDBACK_MAX = 5000;
const FEEDBACK_TEXT = freeText(FEEDBACK_MAX, 'Feedback').min(10, 'Feedback must be at least 10 characters');

/**
 * Feedback & Mentorship Center — wired to live data.
 *
 * Reviewer mode (supervisor / admin / coordinator): real intern picker, the
 * AI feedback summary produced by the engine for the latest submission, live
 * evaluation status, and a Formal Evaluation that posts real supervisor
 * feedback via /logbook/submissions/:id/feedback.
 *
 * Student mode: the feedback they've received plus a live message thread.
 *
 * The Collaborative Chat panel is a real two-way thread (per placement) — see
 * ChatThread / useMessages. Both sides can reply; messages fan out as
 * notifications (+ email to the student).
 */

function Spinner() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[var(--h-712ae2)]" />
    </div>
  );
}

export default function FeedbackCenter() {
  const { user } = useAuth();
  const isReviewer = !!user && ['academic_supervisor', 'admin', 'coordinator'].includes(user.role);
  return isReviewer ? <ReviewerView /> : <StudentView />;
}

// ── Reviewer (supervisor / admin / coordinator) ────────────────

function ReviewerView() {
  const { user } = useAuth();
  const isReadOnlyChat = user?.role === 'coordinator';
  const { data: interns, isLoading, isError } = useFeedbackInterns();
  const submitFeedback = useSubmitFeedback();

  const [selectedId, setSelectedId] = useState<string>('');
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackErr, setFeedbackErr] = useState<string | undefined>();
  const [chatSearch, setChatSearch] = useState('');

  const selected = useMemo(
    () => interns?.find(i => i.placementId === (selectedId || interns[0]?.placementId)),
    [interns, selectedId],
  );

  const chatMatches = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    const list = interns ?? [];
    if (!q) return list;
    return list.filter(i =>
      i.name.toLowerCase().includes(q) || (i.company ?? '').toLowerCase().includes(q),
    );
  }, [interns, chatSearch]);

  const evalStatus = useMemo(() => {
    const total = interns?.length ?? 0;
    const pending = interns?.filter(i => i.latestSubmission?.canReceiveFeedback).length ?? 0;
    const reviewedPct = total > 0 ? Math.round(((total - pending) / total) * 100) : 0;
    return { total, pending, reviewedPct };
  }, [interns]);

  if (isLoading) return <Spinner />;
  if (isError || !interns) {
    return (
      <div className="mx-auto max-w-[1440px] p-6 md:p-8">
        <p className="rounded-lg border border-[var(--h-ba1a1a-20)] bg-[var(--h-ffdad6-40)] p-4 text-sm text-[var(--h-ba1a1a)]">
          Couldn't load interns. Please try again.
        </p>
      </div>
    );
  }

  const sub = selected?.latestSubmission ?? null;
  const canReview = !!sub?.canReceiveFeedback;

  const onSubmit = (outcome: 'approved' | 'flagged') => {
    if (!sub) return;
    const parsed = FEEDBACK_TEXT.safeParse(feedbackText);
    if (!parsed.success) { setFeedbackErr(parsed.error.issues[0]?.message); return; }
    setFeedbackErr(undefined);
    submitFeedback.mutate(
      { submissionId: sub.id, feedbackText: feedbackText.trim(), rating: rating ?? undefined, outcome },
      { onSuccess: () => { setFeedbackText(''); setRating(null); } },
    );
  };

  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--h-15157d)]">Feedback Center</h1>
        <p className="text-sm text-[var(--h-464652)]">AI-assisted feedback summaries, mentorship, and formal evaluations.</p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* AI Feedback Summary */}
        <section className="col-span-12 rounded-xl border border-[var(--h-712ae2-30)] bg-[var(--h-ffffff-70)] p-6 shadow-lg ring-1 ring-[var(--h-712ae2-10)] backdrop-blur lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--h-712ae2)]" fill="currentColor" />
              <h3 className="text-xl font-semibold text-[var(--h-15157d)]">AI-Assisted Feedback Summary</h3>
            </div>
            {sub?.qualityScore != null && (
              <span className="rounded-full bg-[var(--h-712ae2-10)] px-3 py-1 text-xs font-semibold text-[var(--h-712ae2)]">
                Quality {sub.qualityScore}/100
              </span>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--h-0b1c30)]">Select Intern</label>
              <select
                value={selected?.placementId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-[var(--h-c7c5d4)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-2 focus:ring-[var(--h-15157d-20)]"
              >
                {interns.map((i) => (
                  <option key={i.placementId} value={i.placementId}>
                    {i.name}{i.company ? ` — ${i.company}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-[var(--h-15157d-10)] bg-[var(--h-dce9ff-50)] p-4 text-sm text-[var(--h-2e3192)]">
              {sub?.aiFeedbackSummary
                ? <span className="italic">"{sub.aiFeedbackSummary}"</span>
                : sub
                  ? <span>No AI summary for Week {sub.weekNumber} yet — it generates after the logbook is analysed.</span>
                  : <span>This intern has no submissions yet.</span>}
            </div>
            {sub?.sentimentClass && (
              <p className="text-xs text-[var(--h-464652)]">Detected tone: <span className="font-medium capitalize">{sub.sentimentClass}</span></p>
            )}
          </div>
        </section>

        {/* Evaluations Status */}
        <section className="col-span-12 rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] p-6 shadow-sm lg:col-span-4">
          <h3 className="mb-4 text-xl font-semibold text-[var(--h-15157d)]">Evaluations Status</h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[var(--h-0b1c30)]">Reviewed this cycle</span>
                <span className="text-[var(--h-22c087)]">{evalStatus.reviewedPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--h-e5eeff)]">
                <div className="h-full bg-[var(--h-4edea3)]" style={{ width: `${evalStatus.reviewedPct}%` }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[var(--h-0b1c30)]">Awaiting your review</span>
                <span className={evalStatus.pending > 0 ? 'text-[var(--h-ba1a1a)]' : 'text-[var(--h-22c087)]'}>{evalStatus.pending}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--h-e5eeff)]">
                <div className="h-full bg-[var(--h-ba1a1a)]" style={{ width: evalStatus.total ? `${(evalStatus.pending / evalStatus.total) * 100}%` : '0%' }} />
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-[var(--h-464652)]">
            {evalStatus.total} intern{evalStatus.total === 1 ? '' : 's'} assigned to you.
          </p>
        </section>

        {/* Collaborative Chat — search an intern, then chat in a live two-way thread */}
        <section className="col-span-12 flex h-[600px] flex-col overflow-hidden rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] shadow-sm lg:col-span-5">
          {/* Recipient search + picker */}
          <div className="shrink-0 border-b border-[var(--h-c7c5d4-30)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--h-757684)]" />
              <input
                type="text"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
                placeholder="Search interns by name or company…"
                className="w-full rounded-lg border border-[var(--h-c7c5d4)] bg-[var(--h-ffffff)] py-2 pl-9 pr-3 text-sm text-[var(--h-0b1c30)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-1 focus:ring-[var(--h-15157d)]"
              />
            </div>
            <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {chatMatches.length === 0 ? (
                <p className="px-1 py-2 text-xs text-[var(--h-757684)]">No interns match "{chatSearch}".</p>
              ) : (
                chatMatches.map((i) => {
                  const active = i.placementId === selected?.placementId;
                  return (
                    <button
                      key={i.placementId}
                      onClick={() => setSelectedId(i.placementId)}
                      className={
                        active
                          ? 'flex w-full items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-2.5 py-1.5 text-left text-sm text-white'
                          : 'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-[var(--h-0b1c30)] hover:bg-[var(--h-eff4ff)]'
                      }
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--h-e1e0ff)] text-[10px] font-bold text-[var(--h-15157d)]">
                        {i.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {i.name}
                        {i.company && <span className={active ? 'text-[var(--h-c7d0ff)]' : 'text-[var(--h-757684)]'}> · {i.company}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread */}
          {selected ? (
            <ChatThread
              placementId={selected.placementId}
              title={selected.name}
              subtitle={selected.company ?? 'Mentorship chat'}
              disabled={isReadOnlyChat}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--h-757684)]">
              Search and pick an intern to start a conversation.
            </div>
          )}
        </section>

        {/* Formal Evaluation */}
        <section className="col-span-12 rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] p-6 shadow-sm lg:col-span-7">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[var(--h-15157d)]">Formal Evaluation</h3>
              <p className="text-sm text-[var(--h-464652)]">
                {sub ? `Week ${sub.weekNumber} — ${selected?.name}` : 'Select an intern'}
                {sub && !canReview && <span className="ml-2 text-[var(--h-ba1a1a)]">(latest submission not awaiting review)</span>}
              </p>
            </div>
          </div>
          <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--h-0b1c30)]">Overall Rating</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!canReview}
                    onClick={() => setRating(n)}
                    className={
                      n === rating
                        ? 'rounded-lg border border-[var(--h-15157d)] bg-[var(--h-15157d)] py-2 text-sm text-white shadow-sm'
                        : 'rounded-lg border border-[var(--h-c7c5d4)] py-2 text-sm text-[var(--h-0b1c30)] transition-all hover:border-[var(--h-15157d)] hover:bg-[var(--h-15157d-5)] disabled:opacity-50'
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--h-0b1c30)]">Feedback to the intern</label>
              <textarea
                rows={5}
                value={feedbackText}
                maxLength={FEEDBACK_MAX}
                aria-invalid={!!feedbackErr}
                disabled={!canReview}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={canReview ? 'Enter detailed observations about progress, strengths, and areas to improve…' : 'This intern has no submission awaiting review.'}
                className="w-full rounded-xl border border-[var(--h-c7c5d4)] bg-[var(--h-eff4ff)] p-3 text-sm text-[var(--h-0b1c30)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-2 focus:ring-[var(--h-15157d-20)] disabled:opacity-60"
              />
              <div className="flex items-start justify-between gap-3">
                <FieldError message={feedbackErr} />
                <span className="ml-auto shrink-0 text-[11px] text-[var(--h-757684)]">
                  {feedbackText.trim().length}/{FEEDBACK_MAX}
                </span>
              </div>
            </div>

            {submitFeedback.isError && (
              <p className="text-sm text-[var(--h-ba1a1a)]">Couldn't submit feedback. Please try again.</p>
            )}
            {submitFeedback.isSuccess && (
              <p className="flex items-center gap-2 text-sm text-[var(--h-22c087)]"><CheckCircle2 className="h-4 w-4" /> Feedback sent to the intern.</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={!canReview || !feedbackText.trim() || submitFeedback.isPending}
                onClick={() => onSubmit('flagged')}
                className="flex items-center gap-2 rounded-lg border border-[var(--h-ba1a1a)] px-4 py-2 text-sm font-medium text-[var(--h-ba1a1a)] transition-colors hover:bg-[var(--h-ba1a1a-5)] disabled:opacity-50"
              >
                <Flag className="h-4 w-4" /> Flag for follow-up
              </button>
              <button
                type="button"
                disabled={!canReview || !feedbackText.trim() || submitFeedback.isPending}
                onClick={() => onSubmit('approved')}
                className="flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-6 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
              >
                {submitFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve &amp; Submit
              </button>
            </div>
          </form>
        </section>

        {/* Call scheduling (admin-only endpoint) — folded in from /admin/messages */}
        {user?.role === 'admin' && selected && (
          <section className="col-span-12">
            <ScheduleCallCard placementId={selected.placementId} internName={selected.name} />
          </section>
        )}
      </div>
    </div>
  );
}

// ── Student (read-only) ────────────────────────────────────────

function StudentView() {
  const { data: placements, isLoading: pLoading } = useMyPlacements();
  const placementId = placements?.[0]?.id;
  const { data: submissions, isLoading: sLoading } = useSubmissions(placementId);

  if (pLoading || (placementId && sLoading)) return <Spinner />;

  const withFeedback = (submissions ?? [])
    .filter(s => (s.feedback && s.feedback.length > 0) || s.analysis?.aiFeedbackSummary)
    .sort((a, b) => b.weekNumber - a.weekNumber);

  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--h-15157d)]">Your Feedback</h1>
        <p className="text-sm text-[var(--h-464652)]">AI summaries, supervisor feedback, and messages from your mentors.</p>
      </header>

      {/* Live chat with your supervisor / admin team — reply to any message here */}
      <section className="mb-6 flex h-[480px] flex-col overflow-hidden rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] shadow-sm">
        <ChatThread
          placementId={placementId}
          title="Messages"
          subtitle="Your supervisor & admin team"
        />
      </section>

      {withFeedback.length === 0 ? (
        <p className="rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] p-8 text-center text-sm text-[var(--h-464652)]">
          No feedback yet. It appears here once your submissions are reviewed.
        </p>
      ) : (
        <div className="space-y-4">
          {withFeedback.map((s) => (
            <section key={s.id} className="rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--h-15157d)]">Week {s.weekNumber}</h3>
                {s.analysis?.qualityScore != null && (
                  <span className="rounded-full bg-[var(--h-712ae2-10)] px-3 py-1 text-xs font-semibold text-[var(--h-712ae2)]">
                    Quality {s.analysis.qualityScore}/100
                  </span>
                )}
              </div>
              {s.analysis?.aiFeedbackSummary && (
                <div className="mb-3 flex gap-2 rounded-lg border border-[var(--h-712ae2-10)] bg-[var(--h-712ae2-5)] p-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-[var(--h-712ae2)]" fill="currentColor" />
                  <p className="text-sm italic text-[var(--h-464652)]">"{s.analysis.aiFeedbackSummary}"</p>
                </div>
              )}
              {s.feedback?.map((f) => (
                <div key={f.id} className="rounded-lg border border-[var(--h-15157d-10)] bg-[var(--h-dce9ff-40)] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--h-15157d)]">
                      {f.supervisor ? `${f.supervisor.firstName} ${f.supervisor.lastName}` : 'Supervisor'}
                      {f.rating != null && <span className="ml-2 text-[var(--h-464652)]">· {f.rating}/5</span>}
                    </span>
                    <span className={`text-[10px] font-bold uppercase ${f.outcome === 'flagged' ? 'text-[var(--h-ba1a1a)]' : 'text-[var(--h-22c087)]'}`}>{f.outcome}</span>
                  </div>
                  <p className="text-sm text-[var(--h-0b1c30)]">{f.feedbackText}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

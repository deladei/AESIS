import { useMemo, useState } from 'react';
import {
  Sparkles, Send, Paperclip, Video, MoreVertical, Loader2, CheckCircle2, Flag,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedbackInterns } from '@/hooks/useDashboard';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions, useSubmitFeedback } from '@/hooks/useLogbook';

/**
 * Feedback & Mentorship Center — wired to live data.
 *
 * Reviewer mode (supervisor / admin / coordinator): real intern picker, the
 * AI feedback summary produced by the engine for the latest submission, live
 * evaluation status, and a Formal Evaluation that posts real supervisor
 * feedback via /logbook/submissions/:id/feedback.
 *
 * Student mode: read-only view of the feedback they've received.
 *
 * The Collaborative Chat panel has no messaging backend yet, so it renders a
 * labelled "Sample" placeholder.
 */

function SampleBadge() {
  return (
    <span className="rounded-full bg-[#712ae2]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#712ae2]">
      Sample
    </span>
  );
}

function Spinner() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#712ae2]" />
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
  const { data: interns, isLoading, isError } = useFeedbackInterns();
  const submitFeedback = useSubmitFeedback();

  const [selectedId, setSelectedId] = useState<string>('');
  const [rating, setRating] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const selected = useMemo(
    () => interns?.find(i => i.placementId === (selectedId || interns[0]?.placementId)),
    [interns, selectedId],
  );

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
        <p className="rounded-lg border border-[#ba1a1a]/20 bg-[#ffdad6]/40 p-4 text-sm text-[#ba1a1a]">
          Couldn't load interns. Please try again.
        </p>
      </div>
    );
  }

  const sub = selected?.latestSubmission ?? null;
  const canReview = !!sub?.canReceiveFeedback;

  const onSubmit = (outcome: 'approved' | 'flagged') => {
    if (!sub || !feedbackText.trim()) return;
    submitFeedback.mutate(
      { submissionId: sub.id, feedbackText: feedbackText.trim(), rating: rating ?? undefined, outcome },
      { onSuccess: () => { setFeedbackText(''); setRating(null); } },
    );
  };

  return (
    <div className="mx-auto max-w-[1440px] p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#15157d]">Feedback Center</h1>
        <p className="text-sm text-[#464652]">AI-assisted feedback summaries, mentorship, and formal evaluations.</p>
      </header>

      <div className="grid grid-cols-12 gap-6">
        {/* AI Feedback Summary */}
        <section className="col-span-12 rounded-xl border border-[#712ae2]/30 bg-white/70 p-6 shadow-lg ring-1 ring-[#712ae2]/10 backdrop-blur lg:col-span-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#712ae2]" fill="currentColor" />
              <h3 className="text-xl font-semibold text-[#15157d]">AI-Assisted Feedback Summary</h3>
            </div>
            {sub?.qualityScore != null && (
              <span className="rounded-full bg-[#712ae2]/10 px-3 py-1 text-xs font-semibold text-[#712ae2]">
                Quality {sub.qualityScore}/100
              </span>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[#0b1c30]">Select Intern</label>
              <select
                value={selected?.placementId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-[#c7c5d4] bg-white px-3 py-2 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20"
              >
                {interns.map((i) => (
                  <option key={i.placementId} value={i.placementId}>
                    {i.name}{i.company ? ` — ${i.company}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-[#15157d]/10 bg-[#dce9ff]/50 p-4 text-sm text-[#2e3192]">
              {sub?.aiFeedbackSummary
                ? <span className="italic">"{sub.aiFeedbackSummary}"</span>
                : sub
                  ? <span>No AI summary for Week {sub.weekNumber} yet — it generates after the logbook is analysed.</span>
                  : <span>This intern has no submissions yet.</span>}
            </div>
            {sub?.sentimentClass && (
              <p className="text-xs text-[#464652]">Detected tone: <span className="font-medium capitalize">{sub.sentimentClass}</span></p>
            )}
          </div>
        </section>

        {/* Evaluations Status */}
        <section className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm lg:col-span-4">
          <h3 className="mb-4 text-xl font-semibold text-[#15157d]">Evaluations Status</h3>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[#0b1c30]">Reviewed this cycle</span>
                <span className="text-[#22c087]">{evalStatus.reviewedPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                <div className="h-full bg-[#4edea3]" style={{ width: `${evalStatus.reviewedPct}%` }} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-[#0b1c30]">Awaiting your review</span>
                <span className={evalStatus.pending > 0 ? 'text-[#ba1a1a]' : 'text-[#22c087]'}>{evalStatus.pending}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                <div className="h-full bg-[#ba1a1a]" style={{ width: evalStatus.total ? `${(evalStatus.pending / evalStatus.total) * 100}%` : '0%' }} />
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-[#464652]">
            {evalStatus.total} intern{evalStatus.total === 1 ? '' : 's'} assigned to you.
          </p>
        </section>

        {/* Collaborative Chat (no backend yet) */}
        <section className="col-span-12 flex h-[600px] flex-col overflow-hidden rounded-xl border border-[#c7c5d4]/30 bg-white shadow-sm lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#c7c5d4]/30 bg-[#eff4ff] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e1e0ff] text-xs font-bold text-[#15157d]">
                {(selected?.name ?? 'AM').split(' ').map(p => p[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#0b1c30]">{selected?.name ?? 'Intern'}</h4>
                <p className="text-xs text-[#464652]">{selected?.company ?? 'Mentorship chat'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <SampleBadge />
              <button className="rounded-full p-2 text-[#464652] hover:bg-[#dce9ff]"><Video className="h-5 w-5" /></button>
              <button className="rounded-full p-2 text-[#464652] hover:bg-[#dce9ff]"><MoreVertical className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="flex-grow space-y-4 overflow-y-auto bg-[#f8f9ff]/50 p-4">
            <div className="flex max-w-[85%] gap-3">
              <div className="rounded-2xl rounded-tl-none bg-[#dce9ff] p-3">
                <p className="text-sm text-[#0b1c30]">Hi! I've just finished the responsive grid for the analytics page. Would love a quick review.</p>
                <span className="mt-1 block text-[10px] text-[#464652]">10:24 AM</span>
              </div>
            </div>
            <div className="ml-auto flex max-w-[85%] justify-end gap-3">
              <div className="rounded-2xl rounded-tr-none bg-[#15157d] p-3 text-white shadow-sm">
                <p className="text-sm">Great work — I'll take a look before our sync. The spacing looks much better.</p>
                <span className="mt-1 block text-right text-[10px] text-[#9da1ff]">10:45 AM</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-[#c7c5d4]/30 p-4">
            <button disabled className="rounded-full p-2 text-[#464652] opacity-50"><Paperclip className="h-5 w-5" /></button>
            <input type="text" disabled placeholder="Messaging coming soon…" className="flex-grow rounded-full border-none bg-[#eff4ff] px-4 py-2 text-sm focus:outline-none" />
            <button disabled className="rounded-full bg-[#15157d] p-2 text-white opacity-50"><Send className="h-5 w-5" /></button>
          </div>
        </section>

        {/* Formal Evaluation */}
        <section className="col-span-12 rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm lg:col-span-7">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#15157d]">Formal Evaluation</h3>
              <p className="text-sm text-[#464652]">
                {sub ? `Week ${sub.weekNumber} — ${selected?.name}` : 'Select an intern'}
                {sub && !canReview && <span className="ml-2 text-[#ba1a1a]">(latest submission not awaiting review)</span>}
              </p>
            </div>
          </div>
          <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#0b1c30]">Overall Rating</label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!canReview}
                    onClick={() => setRating(n)}
                    className={
                      n === rating
                        ? 'rounded-lg border border-[#15157d] bg-[#15157d] py-2 text-sm text-white shadow-sm'
                        : 'rounded-lg border border-[#c7c5d4] py-2 text-sm text-[#0b1c30] transition-all hover:border-[#15157d] hover:bg-[#15157d]/5 disabled:opacity-50'
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#0b1c30]">Feedback to the intern</label>
              <textarea
                rows={5}
                value={feedbackText}
                disabled={!canReview}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder={canReview ? 'Enter detailed observations about progress, strengths, and areas to improve…' : 'This intern has no submission awaiting review.'}
                className="w-full rounded-xl border border-[#c7c5d4] bg-[#eff4ff] p-3 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none focus:ring-2 focus:ring-[#15157d]/20 disabled:opacity-60"
              />
            </div>

            {submitFeedback.isError && (
              <p className="text-sm text-[#ba1a1a]">Couldn't submit feedback. Please try again.</p>
            )}
            {submitFeedback.isSuccess && (
              <p className="flex items-center gap-2 text-sm text-[#22c087]"><CheckCircle2 className="h-4 w-4" /> Feedback sent to the intern.</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={!canReview || !feedbackText.trim() || submitFeedback.isPending}
                onClick={() => onSubmit('flagged')}
                className="flex items-center gap-2 rounded-lg border border-[#ba1a1a] px-4 py-2 text-sm font-medium text-[#ba1a1a] transition-colors hover:bg-[#ba1a1a]/5 disabled:opacity-50"
              >
                <Flag className="h-4 w-4" /> Flag for follow-up
              </button>
              <button
                type="button"
                disabled={!canReview || !feedbackText.trim() || submitFeedback.isPending}
                onClick={() => onSubmit('approved')}
                className="flex items-center gap-2 rounded-lg bg-[#15157d] px-6 py-2 text-sm font-medium text-white transition-all hover:shadow-md disabled:opacity-50"
              >
                {submitFeedback.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve &amp; Submit
              </button>
            </div>
          </form>
        </section>
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
        <h1 className="text-2xl font-bold text-[#15157d]">Your Feedback</h1>
        <p className="text-sm text-[#464652]">AI summaries and supervisor feedback on your logbook submissions.</p>
      </header>

      {withFeedback.length === 0 ? (
        <p className="rounded-xl border border-[#c7c5d4]/30 bg-white p-8 text-center text-sm text-[#464652]">
          No feedback yet. It appears here once your submissions are reviewed.
        </p>
      ) : (
        <div className="space-y-4">
          {withFeedback.map((s) => (
            <section key={s.id} className="rounded-xl border border-[#c7c5d4]/30 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#15157d]">Week {s.weekNumber}</h3>
                {s.analysis?.qualityScore != null && (
                  <span className="rounded-full bg-[#712ae2]/10 px-3 py-1 text-xs font-semibold text-[#712ae2]">
                    Quality {s.analysis.qualityScore}/100
                  </span>
                )}
              </div>
              {s.analysis?.aiFeedbackSummary && (
                <div className="mb-3 flex gap-2 rounded-lg border border-[#712ae2]/10 bg-[#712ae2]/5 p-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#712ae2]" fill="currentColor" />
                  <p className="text-sm italic text-[#464652]">"{s.analysis.aiFeedbackSummary}"</p>
                </div>
              )}
              {s.feedback?.map((f) => (
                <div key={f.id} className="rounded-lg border border-[#15157d]/10 bg-[#dce9ff]/40 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-[#15157d]">
                      {f.supervisor ? `${f.supervisor.firstName} ${f.supervisor.lastName}` : 'Supervisor'}
                      {f.rating != null && <span className="ml-2 text-[#464652]">· {f.rating}/5</span>}
                    </span>
                    <span className={`text-[10px] font-bold uppercase ${f.outcome === 'flagged' ? 'text-[#ba1a1a]' : 'text-[#22c087]'}`}>{f.outcome}</span>
                  </div>
                  <p className="text-sm text-[#0b1c30]">{f.feedbackText}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

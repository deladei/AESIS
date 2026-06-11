import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, CheckCircle2, RotateCcw, Sparkles, Clock, Inbox, AlertCircle,
  CalendarDays, Tag, FileText, XCircle,
} from 'lucide-react';
import {
  useReviewQueue, useEntry, useAcknowledgeEntry, useReturnEntry, useRejectEntry,
  type LogbookEntry, type EntryStatus,
} from '@/hooks/useEntries';

function studentName(e: LogbookEntry): string {
  const s = e.placement?.student;
  return s ? `${s.firstName} ${s.lastName}` : 'Student';
}

function fmtDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function fmtRange(start: string, end: string): string {
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const e = new Date(`${end.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${s} – ${e}`;
}

function relevancePct(e: LogbookEntry): number | null {
  const r = e.assessments?.[0]?.relevance;
  return r == null ? null : Math.round(Number(r) * 100);
}

// The AI summary JSON shape from the enrichment worker (best-effort render).
interface AiSummary {
  headline?: string;
  themes?: string[];
  concerns?: string[];
}

const STATUS_LABEL: Record<EntryStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', returned: 'Returned',
  acknowledged: 'Acknowledged', rejected: 'Rejected',
};

export default function EntryReview() {
  const { data: queue = [], isLoading } = useReviewQueue('submitted');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  // Auto-select the first item; keep selection valid as the queue changes.
  useEffect(() => {
    if (queue.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !queue.some((e) => e.id === selectedId)) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId]);

  const { data: detail, isLoading: detailLoading } = useEntry(selectedId ?? undefined);

  const acknowledge = useAcknowledgeEntry();
  const returnEntry = useReturnEntry();
  const rejectEntry = useRejectEntry();
  const busy = acknowledge.isPending || returnEntry.isPending || rejectEntry.isPending;

  // Reset the form when switching entries.
  useEffect(() => { setComment(''); setScore(''); setError(null); setDoneMsg(null); }, [selectedId]);

  const aiSummary = useMemo<AiSummary | null>(() => {
    const s = detail?.assessments?.[0]?.summary;
    return s && typeof s === 'object' ? (s as AiSummary) : null;
  }, [detail?.assessments]);

  const apiErr = (e: unknown) =>
    ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
    'Something went wrong. Please try again.';

  const handleAcknowledge = async () => {
    if (!selectedId) return;
    setError(null);
    const raw = score.trim();
    if (raw === '') { setError('A score (0–100) is required to acknowledge a week.'); return; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setError('Score must be a number between 0 and 100.'); return;
    }
    try {
      await acknowledge.mutateAsync({ entryId: selectedId, comment: comment.trim() || undefined, score: n });
      setDoneMsg('Week acknowledged and scored. The student has been notified.');
    } catch (e) { setError(apiErr(e)); }
  };

  const handleReturn = async () => {
    if (!selectedId) return;
    if (!comment.trim()) { setError('A comment is required to return a week for revision.'); return; }
    setError(null);
    try {
      await returnEntry.mutateAsync({ entryId: selectedId, comment: comment.trim() });
      setDoneMsg('Week returned for revision. The student has been notified.');
    } catch (e) { setError(apiErr(e)); }
  };

  const handleReject = async () => {
    if (!selectedId) return;
    if (!comment.trim()) { setError('A reason is required to reject a week.'); return; }
    setError(null);
    try {
      await rejectEntry.mutateAsync({ entryId: selectedId, comment: comment.trim() });
      setDoneMsg('Week rejected. The student has been notified.');
    } catch (e) { setError(apiErr(e)); }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-[#d8dce6] bg-white px-3 py-2.5 text-sm text-[#0b1c30] placeholder-[#94a3b8] transition-colors focus:border-[#8a4cfc] focus:outline-none focus:ring-1 focus:ring-[#8a4cfc]';

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0b1c30]">Review logbooks</h1>
        <p className="mt-0.5 text-sm text-[#464652]">
          {queue.length === 0
            ? 'No weeks awaiting your review.'
            : `${queue.length} week${queue.length === 1 ? '' : 's'} awaiting your review`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Queue */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[#e2e6ef] bg-white">
            <div className="border-b border-[#e2e6ef] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Awaiting review
            </div>
            {queue.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto mb-2 h-7 w-7 text-[#cbd2e0]" />
                <p className="text-sm text-[#94a3b8]">You're all caught up.</p>
              </div>
            ) : (
              <div className="max-h-[68vh] overflow-y-auto">
                {queue.map((e) => {
                  const active = e.id === selectedId;
                  const rel = relevancePct(e);
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full border-b border-[#f0f2f7] px-4 py-3 text-left transition-colors last:border-0 ${
                        active ? 'bg-[#f1ecff]' : 'hover:bg-[#f8f9ff]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${active ? 'text-[#15157d]' : 'text-[#0b1c30]'}`}>
                          {studentName(e)}
                        </p>
                        <span className="shrink-0 rounded-full bg-[#e1e8ff] px-2 py-0.5 text-[11px] font-semibold text-[#15157d]">
                          Wk {e.weekNumber}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#64748b]">
                        {e.placement?.company?.name ?? 'Placement'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#94a3b8]">
                        {e.submittedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtDate(e.submittedAt)}
                          </span>
                        )}
                        {rel != null && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${
                            rel >= 60 ? 'bg-[#dcf5e6] text-[#1b7a45]' : 'bg-[#fff4e0] text-[#9a6700]'
                          }`}>
                            <Sparkles className="h-3 w-3" /> {rel}%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Detail + action */}
        <section>
          {!selectedId ? (
            <div className="rounded-xl border border-dashed border-[#d8dce6] bg-white py-24 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[#aee3c2]" />
              <h2 className="text-base font-semibold text-[#0b1c30]">Nothing to review</h2>
              <p className="mt-1 text-sm text-[#64748b]">Submitted weeks from your interns will appear here.</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[#e2e6ef] bg-white">
              <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
              {/* Entry content */}
              <div className="space-y-5">
                <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-[#0b1c30]">{studentName(detail)}</h2>
                      <p className="text-sm text-[#464652]">
                        Week {detail.weekNumber} · {fmtRange(detail.periodStart, detail.periodEnd)}
                      </p>
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {detail.placement?.company?.name ?? '—'}
                        {detail.submittedAt && ` · Submitted ${fmtDate(detail.submittedAt, true)}`}
                        {detail.version > 1 && ` · Revision ${detail.version}`}
                      </p>
                    </div>
                    {detail.hoursLogged != null && (
                      <span className="rounded-lg bg-[#eff4ff] px-3 py-1.5 text-sm font-semibold text-[#15157d]">
                        {Number(detail.hoursLogged)} hrs
                      </span>
                    )}
                  </div>
                </div>

                {/* Activities */}
                <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
                    <FileText className="h-4 w-4 text-[#8a4cfc]" /> Activities
                  </h3>
                  <div className="space-y-3">
                    {(detail.activities ?? []).length === 0 && (
                      <p className="text-sm text-[#94a3b8]">No activities recorded.</p>
                    )}
                    {(detail.activities ?? []).map((a, i) => (
                      <div key={i} className="rounded-lg border border-[#eef0f5] bg-[#fbfcfe] p-3">
                        <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-[#64748b]">
                          <CalendarDays className="h-3 w-3" /> {fmtDate(a.activityDate)}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-[#0b1c30]">{a.description}</p>
                        {a.competencyTags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.competencyTags.map((t) => (
                              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[#e1e8ff] px-2 py-0.5 text-[11px] font-medium text-[#15157d]">
                                <Tag className="h-2.5 w-2.5" /> {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reflection */}
                {detail.reflection ? (
                  <div className="rounded-xl border border-[#e2e6ef] bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-[#0b1c30]">Reflection</h3>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#64748b]">What they learned</p>
                      <p className="whitespace-pre-wrap text-sm text-[#0b1c30]">{detail.reflection.learning}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Challenges</p>
                      <p className="whitespace-pre-wrap text-sm text-[#0b1c30]">{detail.reflection.challenges}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                    <p className="text-sm text-[#94a3b8]">No reflection submitted for this week.</p>
                  </div>
                )}

                {/* Event history */}
                {detail.events && detail.events.length > 0 && (
                  <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                    <h3 className="mb-3 text-sm font-semibold text-[#0b1c30]">History</h3>
                    <ol className="space-y-2">
                      {detail.events.map((ev) => (
                        <li key={ev.id} className="flex items-start gap-2 text-xs text-[#464652]">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8a4cfc]" />
                          <span>
                            <span className="font-medium text-[#0b1c30]">
                              {ev.fromStatus ? `${STATUS_LABEL[ev.fromStatus]} → ` : ''}{STATUS_LABEL[ev.toStatus]}
                            </span>
                            <span className="text-[#94a3b8]"> · {fmtDate(ev.createdAt, true)}</span>
                            {ev.score != null && (
                              <span className="mt-0.5 block font-semibold text-[#15157d]">Score: {Number(ev.score)}/100</span>
                            )}
                            {ev.comment && <span className="mt-0.5 block italic text-[#64748b]">"{ev.comment}"</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* AI panel + actions */}
              <div className="space-y-4">
                <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
                    <Sparkles className="h-4 w-4 text-[#8a4cfc]" /> AI assessment
                  </h3>
                  {detail.assessments && detail.assessments.length > 0 ? (
                    <div className="space-y-3">
                      {relevancePct(detail) != null && (
                        <div>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="text-[#64748b]">CS relevance</span>
                            <span className="font-mono text-[#0b1c30]">{relevancePct(detail)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#eef0f5]">
                            <div
                              className={`h-1.5 rounded-full ${relevancePct(detail)! >= 60 ? 'bg-[#1b7a45]' : 'bg-[#d99a00]'}`}
                              style={{ width: `${relevancePct(detail)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {aiSummary?.headline && (
                        <p className="text-sm leading-relaxed text-[#0b1c30]">{aiSummary.headline}</p>
                      )}
                      {aiSummary?.concerns && aiSummary.concerns.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#9a6700]">Concerns</p>
                          <ul className="list-inside list-disc space-y-0.5 text-xs text-[#464652]">
                            {aiSummary.concerns.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                      <p className="text-[11px] text-[#94a3b8]">AI scores are advisory. Your review is final.</p>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#cbd2e0]" />
                      <p className="text-xs text-[#94a3b8]">AI analysis pending or unavailable.</p>
                    </div>
                  )}
                </div>

                {/* Action card */}
                <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
                  {doneMsg ? (
                    <div className="flex items-start gap-2 text-sm text-[#1b7a45]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {doneMsg}
                    </div>
                  ) : (
                    <>
                      <label htmlFor="score" className="mb-1.5 block text-sm font-semibold text-[#0b1c30]">
                        Score
                        <span className="ml-2 text-xs font-normal text-[#64748b]">Out of 100 · required to acknowledge</span>
                      </label>
                      <input
                        id="score" type="number" min={0} max={100} step={1} value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="0–100"
                        className={`${inputCls} mb-4`}
                      />
                      <label htmlFor="comment" className="mb-1.5 block text-sm font-semibold text-[#0b1c30]">
                        Feedback
                        <span className="ml-2 text-xs font-normal text-[#64748b]">Required to return</span>
                      </label>
                      <textarea
                        id="comment" rows={5} value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Share specific, constructive feedback for this week…"
                        className={`${inputCls} resize-none`}
                      />
                      {error && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-[#b3261e]">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                        </div>
                      )}
                      <div className="mt-3 space-y-2">
                        <button
                          type="button" onClick={handleAcknowledge} disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#15157d] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1f1fa0] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {acknowledge.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <CheckCircle2 className="h-4 w-4" />}
                          Acknowledge week
                        </button>
                        <button
                          type="button" onClick={handleReturn} disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#f5b8ad] bg-[#fff1ee] px-4 py-2.5 text-sm font-semibold text-[#b3261e] transition-colors hover:bg-[#ffe2dc] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {returnEntry.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RotateCcw className="h-4 w-4" />}
                          Return for revision
                        </button>
                        <button
                          type="button" onClick={handleReject} disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-[#b3261e] transition-colors hover:bg-[#fff1ee] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {rejectEntry.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <XCircle className="h-4 w-4" />}
                          Reject week
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, CheckCircle2, RotateCcw, Sparkles, Clock, Inbox, AlertCircle,
  CalendarDays, Tag, FileText,
} from 'lucide-react';
import {
  useReviewQueue, useEntry, useAcknowledgeEntry, useReturnEntry, useReviewStats, dayKey,
  type LogbookEntry, type EntryStatus, type QualityBreakdown, type PlagiarismReport,
  type FeedbackDraft,
} from '@/hooks/useEntries';
import { EntryAttachments } from '@/components/attachments/EntryAttachments';
import LatePill from '@/components/shared/LatePill';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { InitialsAvatar, NoValue } from '@/components/ui/Bits';
import { LineTrend } from '@/components/ui/Charts';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';
import { FileCheck2, Flag, Star, TrendingUp } from 'lucide-react';

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

/** A date-only value (YYYY-MM-DD) rendered as the calendar day it is, not as a
 *  local-midnight instant that can slide a day either side of UTC. */
function fmtDay(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
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

// A rubric value is only renderable if it's a real number in range — anything
// else is skipped, never shown as 0 (no impossible states).
function pct100(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
}

// The quality.relevance dimension is deliberately omitted: the panel already
// shows CS relevance from the classifier, and two differently-computed
// "relevance" numbers side by side would only conflict.
const QUALITY_DIMS: { key: keyof QualityBreakdown; label: string }[] = [
  { key: 'overall', label: 'Overall writing quality' },
  { key: 'task_depth', label: 'Task detail' },
  { key: 'tech_vocab', label: 'Technical vocabulary' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'temporal_consistency', label: 'Chronology' },
];

const STATUS_LABEL: Record<EntryStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', returned: 'Returned',
  acknowledged: 'Acknowledged',
};

export default function EntryReview() {
  const { data: queue = [], isLoading } = useReviewQueue('submitted');
  const statsQuery = useReviewStats();
  const stats = statsQuery.data;

  // Deep-link support (e.g. the admin dashboard's Recent Submissions rows pass
  // ?entryId=). The linked entry may already be reviewed, so it's honoured even
  // when it isn't in the awaiting-review queue.
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get('entryId');

  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId);
  const [comment, setComment] = useState('');
  const [score, setScore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  // Auto-select the first item; keep selection valid as the queue changes —
  // but never clobber a deep-linked entry that lives outside the queue.
  useEffect(() => {
    if (selectedId === deepLinkId && deepLinkId) return;
    if (queue.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !queue.some((e) => e.id === selectedId)) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId, deepLinkId]);

  const { data: detail, isLoading: detailLoading } = useEntry(selectedId ?? undefined);

  const acknowledge = useAcknowledgeEntry();
  const returnEntry = useReturnEntry();
  const busy = acknowledge.isPending || returnEntry.isPending;

  // Reset the form when switching entries.
  useEffect(() => { setComment(''); setScore(''); setError(null); setDoneMsg(null); }, [selectedId]);

  const aiSummary = useMemo<AiSummary | null>(() => {
    const s = detail?.assessments?.[0]?.summary;
    return s && typeof s === 'object' ? (s as AiSummary) : null;
  }, [detail?.assessments]);

  const latest = detail?.assessments?.[0];
  const quality: QualityBreakdown | null =
    latest?.quality && typeof latest.quality === 'object' ? latest.quality : null;
  const plagiarism: PlagiarismReport | null =
    latest?.plagiarism && typeof latest.plagiarism === 'object' ? latest.plagiarism : null;
  const draft: FeedbackDraft | null =
    latest?.feedbackDraft && typeof latest.feedbackDraft.text === 'string' && latest.feedbackDraft.text
      ? latest.feedbackDraft
      : null;

  // Days the student wrote up after their own date, and by how much (anti-cheat
  // transparency). A Map, not a Set: the count is the point — "logged late" told
  // a supervisor nothing about whether it was a day or a month.
  const lateByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of detail?.days ?? []) if (d.loggedLate) m.set(dayKey(d), d.lateByDays ?? 0);
    return m;
  }, [detail?.days]);

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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
      </div>
    );
  }

  const inputCls =
    'w-full rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2.5 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] transition-colors focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]';

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Review logbooks</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Manage and review intern weekly logbook submissions.
        </p>
      </header>

      {/* ── Headline figures ─────────────────────────────────── */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending reviews" value={stats?.pending ?? queue.length}
          icon={FileCheck2} tone="brand" loading={statsQuery.isLoading}
          footnote="Weeks awaiting your decision"
        />
        <StatCard
          label="Flagged by enrichment" value={stats?.flagged ?? 0}
          icon={Flag} tone="warn" loading={statsQuery.isLoading}
          footnote="Weeks carrying at least one advisory flag"
        />
        <StatCard
          label="Average quality"
          value={stats?.avgQuality != null
            ? `${stats.avgQuality}/100`
            : <NoValue title="No week has been assessed yet" />}
          icon={Star} tone="info" loading={statsQuery.isLoading}
          footnote="Advisory rubric mean — never a grade"
        />
        <StatCard
          label="Submitted on time"
          value={stats?.onTrackPct != null
            ? `${stats.onTrackPct}%`
            : <NoValue title="No week has come due yet" />}
          icon={TrendingUp} tone="ok" loading={statsQuery.isLoading}
          footnote="Share of weeks due that were submitted"
        />
      </div>

      {/* ── Trend + queue table ──────────────────────────────── */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="Weekly submission trend" subtitle="Last 8 weeks, counted on the date each week was submitted" />
          {statsQuery.isLoading ? (
            <SkeletonRows rows={3} />
          ) : !stats?.trend.some(t => t.count > 0) ? (
            <EmptyState
              title="No submissions in the last eight weeks"
              hint="The chart fills in as your interns submit their weeks."
              className="py-8"
            />
          ) : (
            <LineTrend
              data={stats.trend.map(t => ({
                week: new Date(`${t.week}T00:00:00Z`).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', timeZone: 'UTC',
                }),
                submissions: t.count,
              }))}
              xKey="week" yKey="submissions" yLabel="Submissions" height={200}
            />
          )}
        </Card>

        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">
              Review queue
              <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-ink">
                {queue.length}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Pick a week to open it in the reviewer below.
            </p>
          </div>

          {queue.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="You're all caught up"
              hint="Submitted weeks from your interns appear here."
              className="py-10"
            />
          ) : (
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="sticky top-0 bg-surface-sunken">
                  <tr className="text-left text-xs font-semibold text-ink-secondary">
                    <th scope="col" className="px-4 py-2.5">Intern</th>
                    <th scope="col" className="px-4 py-2.5">Week</th>
                    <th scope="col" className="px-4 py-2.5">Quality</th>
                    <th scope="col" className="px-4 py-2.5">Flags</th>
                    <th scope="col" className="px-4 py-2.5">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((e) => {
                    const active = e.id === selectedId;
                    const flags = e.aiFlags ?? [];
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedId(e.id)}
                        className={`cursor-pointer border-b border-line last:border-0 ${
                          active ? 'bg-brand-soft/50' : 'hover:bg-surface-sunken/70'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <InitialsAvatar name={studentName(e)} size={28} />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-ink">{studentName(e)}</span>
                              <span className="block truncate text-xs text-ink-muted">
                                {e.placement?.company?.name ?? 'Placement'}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink-secondary">Wk {e.weekNumber}</td>
                        <td className="px-4 py-2.5">
                          {e.aiQuality != null
                            ? <span className="font-semibold text-ink">{e.aiQuality}</span>
                            : <NoValue title="Not assessed yet" />}
                        </td>
                        <td className="px-4 py-2.5">
                          {flags.length === 0
                            ? <span className="text-ink-muted">—</span>
                            : (
                              <span className="flex flex-wrap gap-1">
                                {flags.map(f => <Badge key={f} tone="warn">{f}</Badge>)}
                              </span>
                            )}
                        </td>
                        <td className="px-4 py-2.5 text-ink-secondary">
                          {e.submittedAt ? fmtDate(e.submittedAt) : <NoValue />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Queue */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)]">
            <div className="border-b border-[var(--h-e2e6ef)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">
              Awaiting review
            </div>
            {queue.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto mb-2 h-7 w-7 text-[var(--h-cbd2e0)]" />
                <p className="text-sm text-[var(--h-94a3b8)]">You're all caught up.</p>
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
                      className={`w-full border-b border-[var(--h-f0f2f7)] px-4 py-3 text-left transition-colors last:border-0 ${
                        active ? 'bg-[var(--h-f1ecff)]' : 'hover:bg-[var(--h-f8f9ff)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm font-semibold ${active ? 'text-[var(--h-15157d)]' : 'text-[var(--h-0b1c30)]'}`}>
                          {studentName(e)}
                        </p>
                        <span className="shrink-0 rounded-full bg-[var(--h-e1e8ff)] px-2 py-0.5 text-[11px] font-semibold text-[var(--h-15157d)]">
                          Wk {e.weekNumber}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--h-64748b)]">
                        {e.placement?.company?.name ?? 'Placement'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--h-94a3b8)]">
                        {e.submittedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {fmtDate(e.submittedAt)}
                          </span>
                        )}
                        {rel != null && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${
                            rel >= 60 ? 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]' : 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]'
                          }`}>
                            <Sparkles className="h-3 w-3" /> {rel}%
                          </span>
                        )}
                        {!!e.lateDays && (
                          <span
                            title={`${e.lateDays} day(s) logged late; the latest by ${e.maxDaysLate} day(s)`}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--h-fff4e0)] px-1.5 py-0.5 font-medium text-[var(--h-9a6700)]"
                          >
                            <Clock className="h-3 w-3" /> {e.lateDays} late
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
            <div className="rounded-xl border border-dashed border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] py-24 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-[var(--h-aee3c2)]" />
              <h2 className="text-base font-semibold text-[var(--h-0b1c30)]">Nothing to review</h2>
              <p className="mt-1 text-sm text-[var(--h-64748b)]">Submitted weeks from your interns will appear here.</p>
            </div>
          ) : detailLoading || !detail ? (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
              {/* Entry content */}
              <div className="space-y-5">
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">{studentName(detail)}</h2>
                      <p className="text-sm text-[var(--h-464652)]">
                        Week {detail.weekNumber} · {fmtRange(detail.periodStart, detail.periodEnd)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--h-64748b)]">
                        {detail.placement?.company?.name ?? '—'}
                        {detail.submittedAt && ` · Submitted ${fmtDate(detail.submittedAt, true)}`}
                        {detail.version > 1 && ` · Revision ${detail.version}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* The week's late headline, before the reviewer reads a word
                          of it. Silent when nothing was late. */}
                      {!!detail.lateSummary?.lateDays && (
                        <span
                          title={`Latest entry was ${detail.lateSummary.maxDaysLate} day(s) late`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-fff4e0)] px-3 py-1.5 text-sm font-semibold text-[var(--h-9a6700)]"
                        >
                          <Clock className="h-4 w-4" />
                          {detail.lateSummary.lateDays} of {(detail.days ?? []).length} day
                          {(detail.days ?? []).length === 1 ? '' : 's'} logged late
                        </span>
                      )}
                      {detail.hoursLogged != null && (
                        <span className="rounded-lg bg-[var(--h-eff4ff)] px-3 py-1.5 text-sm font-semibold text-[var(--h-15157d)]">
                          {Number(detail.hoursLogged)} hrs
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Days. The screen used to render only activities, so a day the
                    student wrote up without itemising activities was invisible
                    here — and lateness lives on the day, not the activity. */}
                {(detail.days ?? []).length > 0 && (
                  <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--h-0b1c30)]">
                      <CalendarDays className="h-4 w-4 text-[var(--h-8a4cfc)]" /> Days
                    </h3>
                    <ul className="divide-y divide-[var(--h-f0f2f7)]">
                      {(detail.days ?? []).map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                          <span className="min-w-[7.5rem] text-sm font-medium text-[var(--h-0b1c30)]">
                            {fmtDay(dayKey(d))}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            d.status === 'submitted'
                              ? 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]'
                              : 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]'
                          }`}>
                            {d.status === 'submitted' ? 'Submitted' : 'Draft'}
                          </span>
                          <LatePill days={d.lateByDays ?? 0} />
                          <span className="ml-auto text-xs text-[var(--h-94a3b8)]">
                            Logged {fmtDate(d.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Activities */}
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--h-0b1c30)]">
                    <FileText className="h-4 w-4 text-[var(--h-8a4cfc)]" /> Activities
                  </h3>
                  <div className="space-y-3">
                    {(detail.activities ?? []).length === 0 && (
                      <p className="text-sm text-[var(--h-94a3b8)]">No activities recorded.</p>
                    )}
                    {(detail.activities ?? []).map((a, i) => (
                      <div key={i} className="rounded-lg border border-[var(--h-eef0f5)] bg-[var(--h-fbfcfe)] p-3">
                        <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--h-64748b)]">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {fmtDate(a.activityDate)}</span>
                          <LatePill compact days={lateByDate.get(a.activityDate.slice(0, 10)) ?? 0} />
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-[var(--h-0b1c30)]">{a.description}</p>
                        {a.competencyTags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.competencyTags.map((t) => (
                              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-[var(--h-e1e8ff)] px-2 py-0.5 text-[11px] font-medium text-[var(--h-15157d)]">
                                <Tag className="h-2.5 w-2.5" /> {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evidence — photos / documents the student attached. Read-only
                    for the supervisor, so they can assess the actual work. */}
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <EntryAttachments entryId={detail.id} editable={false} />
                </div>

                {/* Reflection */}
                {detail.reflection ? (
                  <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-[var(--h-0b1c30)]">Reflection</h3>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">What they learned</p>
                      <p className="whitespace-pre-wrap text-sm text-[var(--h-0b1c30)]">{detail.reflection.learning}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Challenges</p>
                      <p className="whitespace-pre-wrap text-sm text-[var(--h-0b1c30)]">{detail.reflection.challenges}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                    <p className="text-sm text-[var(--h-94a3b8)]">No reflection submitted for this week.</p>
                  </div>
                )}

                {/* Event history */}
                {detail.events && detail.events.length > 0 && (
                  <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--h-0b1c30)]">History</h3>
                    <ol className="space-y-2">
                      {detail.events.map((ev) => (
                        <li key={ev.id} className="flex items-start gap-2 text-xs text-[var(--h-464652)]">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--h-8a4cfc)]" />
                          <span>
                            <span className="font-medium text-[var(--h-0b1c30)]">
                              {ev.fromStatus ? `${STATUS_LABEL[ev.fromStatus]} → ` : ''}{STATUS_LABEL[ev.toStatus]}
                            </span>
                            <span className="text-[var(--h-94a3b8)]"> · {fmtDate(ev.createdAt, true)}</span>
                            {ev.score != null && (
                              <span className="mt-0.5 block font-semibold text-[var(--h-15157d)]">Score: {Number(ev.score)}/100</span>
                            )}
                            {ev.comment && <span className="mt-0.5 block italic text-[var(--h-64748b)]">"{ev.comment}"</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* AI panel + actions */}
              <div className="space-y-4">
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--h-0b1c30)]">
                    <Sparkles className="h-4 w-4 text-[var(--h-8a4cfc)]" /> AI assessment
                  </h3>
                  {detail.assessments && detail.assessments.length > 0 ? (
                    <div className="space-y-3">
                      {relevancePct(detail) != null && (
                        <div>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="text-[var(--h-64748b)]">CS relevance</span>
                            <span className="font-mono text-[var(--h-0b1c30)]">{relevancePct(detail)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--h-eef0f5)]">
                            <div
                              className={`h-1.5 rounded-full ${relevancePct(detail)! >= 60 ? 'bg-[var(--h-1b7a45)]' : 'bg-[var(--h-d99a00)]'}`}
                              style={{ width: `${relevancePct(detail)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {aiSummary?.headline && (
                        <p className="text-sm leading-relaxed text-[var(--h-0b1c30)]">{aiSummary.headline}</p>
                      )}
                      {aiSummary?.concerns && aiSummary.concerns.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--h-9a6700)]">Concerns</p>
                          <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--h-464652)]">
                            {aiSummary.concerns.map((c, i) => <li key={i}>{c}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Quality breakdown (v2 assessments only) */}
                      {quality && QUALITY_DIMS.some((d) => pct100(quality[d.key]) != null) && (
                        <div className="border-t border-[var(--h-f0f2f7)] pt-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Writing quality</p>
                          <div className="space-y-2">
                            {QUALITY_DIMS.map(({ key, label }) => {
                              const v = pct100(quality[key]);
                              if (v == null) return null;
                              return (
                                <div key={key}>
                                  <div className="mb-0.5 flex justify-between text-xs">
                                    <span className="text-[var(--h-64748b)]">{label}</span>
                                    <span className="font-mono text-[var(--h-0b1c30)]">{v}</span>
                                  </div>
                                  <div className="h-1 w-full rounded-full bg-[var(--h-eef0f5)]">
                                    <div
                                      className={`h-1 rounded-full ${v >= 60 ? 'bg-[var(--h-1b7a45)]' : 'bg-[var(--h-d99a00)]'}`}
                                      style={{ width: `${v}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {quality.feedback && (
                            <p className="mt-2 text-xs leading-relaxed text-[var(--h-464652)]">{quality.feedback}</p>
                          )}
                        </div>
                      )}

                      {/* Similarity report — only rendered when a check actually ran */}
                      {plagiarism?.checked && (
                        plagiarism.flagged && plagiarism.matches.length > 0 ? (
                          <div className="rounded-lg border border-[var(--h-f5d9a8)] bg-[var(--h-fff4e0)] p-3">
                            <p className="mb-1 text-xs font-semibold text-[var(--h-9a6700)]">Similarity notice</p>
                            <ul className="space-y-1 text-xs text-[var(--h-464652)]">
                              {plagiarism.matches.map((m, i) => {
                                const v = pct100(m.similarity * 100);
                                return (
                                  <li key={i}>
                                    {v != null ? `≈${v}% similar` : 'Similar'} to{' '}
                                    {m.same_student ? "this student's earlier week" : "another student's entry"}
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-1.5 text-[11px] text-[var(--h-9a6700)]">
                              Worth comparing side by side — similarity is not a verdict.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--h-94a3b8)]">
                            No unusual similarity across {plagiarism.corpus_size} other submitted{' '}
                            {plagiarism.corpus_size === 1 ? 'entry' : 'entries'}.
                          </p>
                        )
                      )}

                      <p className="text-[11px] text-[var(--h-94a3b8)]">AI scores are advisory. Your review is final.</p>
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--h-cbd2e0)]" />
                      <p className="text-xs text-[var(--h-94a3b8)]">AI analysis pending or unavailable.</p>
                    </div>
                  )}
                </div>

                {/* Action card — read-only once the week already has a decision
                    (a deep-linked entry can arrive here acknowledged/returned). */}
                <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                  {doneMsg ? (
                    <div className="flex items-start gap-2 text-sm text-[var(--h-1b7a45)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {doneMsg}
                    </div>
                  ) : detail.status !== 'submitted' ? (
                    <div className="flex items-start gap-2 text-sm text-[var(--h-464652)]">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--h-1b7a45)]" />
                      This week is {STATUS_LABEL[detail.status].toLowerCase()} — no action needed. The decision and score are in the entry's history.
                    </div>
                  ) : (
                    <>
                      <label htmlFor="score" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
                        Score
                        <span className="ml-2 text-xs font-normal text-[var(--h-64748b)]">Out of 100 · required to acknowledge</span>
                      </label>
                      <input
                        id="score" type="number" min={0} max={100} step={1} value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="0–100"
                        className={`${inputCls} mb-4`}
                      />
                      <label htmlFor="comment" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
                        Feedback
                        <span className="ml-2 text-xs font-normal text-[var(--h-64748b)]">Required to return</span>
                      </label>
                      {draft && (
                        <div className="mb-2 rounded-lg border border-[var(--h-e1e8ff)] bg-[var(--h-f8f9ff)] p-3">
                          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--h-15157d)]">
                            <Sparkles className="h-3 w-3" /> Suggested draft
                          </p>
                          <p className="text-xs leading-relaxed text-[var(--h-464652)]">{draft.text}</p>
                          {comment !== draft.text && (
                            <button
                              type="button"
                              onClick={() => setComment(draft.text)}
                              className="mt-2 rounded-md border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-2.5 py-1 text-xs font-semibold text-[var(--h-15157d)] transition-colors hover:bg-[var(--h-f1ecff)]"
                            >
                              Insert into feedback
                            </button>
                          )}
                          <p className="mt-1.5 text-[11px] text-[var(--h-94a3b8)]">
                            AI-drafted — review and edit before sending. The student sees only what you send.
                          </p>
                        </div>
                      )}
                      <textarea
                        id="comment" rows={5} value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Share specific, constructive feedback for this week…"
                        className={`${inputCls} resize-none`}
                      />
                      {error && (
                        <div className="mt-2 flex items-start gap-2 text-xs text-[var(--h-b3261e)]">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                        </div>
                      )}
                      <div className="mt-3 space-y-2">
                        <button
                          type="button" onClick={handleAcknowledge} disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {acknowledge.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <CheckCircle2 className="h-4 w-4" />}
                          Acknowledge week
                        </button>
                        <button
                          type="button" onClick={handleReturn} disabled={busy}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--h-f5b8ad)] bg-[var(--h-fff1ee)] px-4 py-2.5 text-sm font-semibold text-[var(--h-b3261e)] transition-colors hover:bg-[var(--h-ffe2dc)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {returnEntry.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RotateCcw className="h-4 w-4" />}
                          Return for revision
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

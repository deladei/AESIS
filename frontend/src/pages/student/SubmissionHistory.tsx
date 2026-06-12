import { useState } from 'react';
import {
  ChevronRight, CheckCircle2, AlertCircle, Lock, Loader2,
  Calendar, Clock, Send, Sparkles,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions } from '@/hooks/useLogbook';

type SubmissionStatus =
  | 'not_submitted' | 'draft' | 'submitted' | 'under_review' | 'approved' | 'flagged';

// ── Status pill — mirrors the light language of the Logbook editor ──
const STATUS_META: Record<SubmissionStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  not_submitted: { label: 'Not submitted', cls: 'bg-[#eef0f5] text-[#64748b] border-[#d8dce6]', Icon: Calendar },
  draft:         { label: 'Draft',         cls: 'bg-[#fff4e0] text-[#9a6700] border-[#f3d690]', Icon: Clock },
  submitted:     { label: 'Submitted',     cls: 'bg-[#e1e8ff] text-[#15157d] border-[#bcc8ff]', Icon: Send },
  under_review:  { label: 'Under review',  cls: 'bg-[#efe7ff] text-[#6b21a8] border-[#dcc9ff]', Icon: Clock },
  approved:      { label: 'Approved',      cls: 'bg-[#dcf5e6] text-[#1b7a45] border-[#aee3c2]', Icon: CheckCircle2 },
  flagged:       { label: 'Flagged',       cls: 'bg-[#ffe2dc] text-[#b3261e] border-[#f5b8ad]', Icon: AlertCircle },
};

function StatusPill({ status }: { status: SubmissionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_submitted;
  const { label, cls, Icon } = meta;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

const FLOW_STEPS = ['Submitted', 'AI Analysis', 'Under Review', 'Approved / Flagged'];

function FlowTracker({ status, aiStatus }: { status: string; aiStatus: string }) {
  const step =
    status === 'not_submitted' || status === 'draft' ? -1 :
    status === 'submitted' && aiStatus !== 'completed' ? 0 :
    status === 'submitted' || status === 'under_review' ? 2 :
    3;

  return (
    <div className="flex items-center gap-0">
      {FLOW_STEPS.map((s, i) => {
        const done = i <= step;
        const flaggedEnd = status === 'flagged' && i === 3;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                done
                  ? flaggedEnd
                    ? 'border-[#f5b8ad] bg-[#ffe2dc]'
                    : 'border-[#bcc8ff] bg-[#e1e8ff]'
                  : 'border-[#d8dce6] bg-[#f7f8fb]'
              }`}>
                {done && (
                  flaggedEnd
                    ? <AlertCircle className="h-3 w-3 text-[#b3261e]" />
                    : <CheckCircle2 className="h-3 w-3 text-[#15157d]" />
                )}
              </div>
              <span className="mt-1 hidden whitespace-nowrap text-[#64748b] sm:block" style={{ fontSize: 9 }}>{s}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`mx-1 h-px w-8 sm:w-12 ${i < step ? 'bg-[#15157d]' : 'bg-[#d8dce6]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SubmissionHistory() {
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data: submissions = [], isLoading: subsLoading } = useSubmissions(activePlacement?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (placementsLoading || subsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
      </div>
    );
  }

  const sorted    = [...submissions].sort((a, b) => b.weekNumber - a.weekNumber);
  const submitted = submissions.filter((s) => s.submissionStatus !== 'not_submitted' && s.submissionStatus !== 'draft');
  const approved  = submissions.filter((s) => s.submissionStatus === 'approved');
  const flagged   = submissions.filter((s) => s.submissionStatus === 'flagged');
  const total     = submissions.length;
  const progress  = total > 0 ? Math.round((submitted.length / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0b1c30]">Submission History</h1>
        <p className="mt-0.5 text-sm text-[#464652]">
          {activePlacement?.company?.name ?? 'Your placement'} · {submitted.length} submitted · {flagged.length} flagged
        </p>
      </div>

      {/* Programme progress */}
      <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0b1c30]">Programme Progress</span>
          <span className="font-mono text-sm text-[#15157d]">{submitted.length} / {total} weeks</span>
        </div>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[#eef0f5]">
          <div className="h-2 rounded-full bg-[#15157d] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[#64748b]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1b7a45]" />Approved ({approved.length})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#b3261e]" />Flagged ({flagged.length})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#cbd2e0]" />Remaining ({total - submitted.length})</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8dce6] bg-white py-14 text-center">
          <Calendar className="mx-auto mb-3 h-9 w-9 text-[#cbd2e0]" />
          <p className="text-sm text-[#64748b]">No submission records found for your placement.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((s) => {
            const isOpen   = selectedId === s.id;
            const upcoming = s.submissionStatus === 'not_submitted';
            const quality  = s.analysis?.qualityScore ?? null;
            const status   = s.submissionStatus as SubmissionStatus;

            return (
              <div
                key={s.id}
                className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                  upcoming ? 'border-[#e8ebf2]' : isOpen ? 'border-[#bcc8ff]' : 'border-[#e2e6ef]'
                }`}
              >
                <button
                  onClick={() => !upcoming && setSelectedId(isOpen ? null : s.id)}
                  disabled={upcoming}
                  className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${
                    upcoming ? 'cursor-default' : 'cursor-pointer hover:bg-[#f8f9ff]'
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                    upcoming
                      ? 'border-[#e2e6ef] bg-[#f3f5f9]'
                      : status === 'flagged'
                        ? 'border-[#f5b8ad] bg-[#ffe2dc]'
                        : status === 'approved'
                          ? 'border-[#aee3c2] bg-[#dcf5e6]'
                          : 'border-[#bcc8ff] bg-[#e1e8ff]'
                  }`}>
                    {upcoming
                      ? <Lock className="h-4 w-4 text-[#94a3b8]" />
                      : <span className={`font-mono text-xs font-bold ${
                          status === 'flagged' ? 'text-[#b3261e]' : status === 'approved' ? 'text-[#1b7a45]' : 'text-[#15157d]'
                        }`}>W{s.weekNumber}</span>
                    }
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#0b1c30]">Week {s.weekNumber}</span>
                      {s.isLate && (
                        <span className="rounded-full border border-[#f3d690] bg-[#fff4e0] px-1.5 py-0.5 text-[10px] font-semibold text-[#9a6700]">Late</span>
                      )}
                      {upcoming
                        ? <span className="text-xs text-[#94a3b8]">Due {formatDeadline(s.deadline)}</span>
                        : <StatusPill status={status} />
                      }
                    </div>
                    <span className="text-xs text-[#64748b]">
                      {s.submittedAt
                        ? `Submitted ${formatDeadline(s.submittedAt)}`
                        : `Due ${formatDeadline(s.deadline)}`}
                    </span>
                  </div>

                  {quality !== null && (
                    <span className={`shrink-0 font-mono text-sm font-bold ${
                      quality >= 75 ? 'text-[#1b7a45]' : quality >= 50 ? 'text-[#9a6700]' : 'text-[#b3261e]'
                    }`}>
                      {quality}/100
                    </span>
                  )}

                  {!upcoming && (
                    <ChevronRight className={`h-4 w-4 shrink-0 text-[#94a3b8] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  )}
                </button>

                {isOpen && !upcoming && (
                  <div className="border-t border-[#eef0f5] px-5 pb-5 pt-5">
                    <div className="mb-4 flex items-center justify-center">
                      <FlowTracker status={s.submissionStatus} aiStatus={s.aiAnalysisStatus} />
                    </div>

                    {s.aiAnalysisStatus === 'completed' && s.analysis?.aiFeedbackSummary && (
                      <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#e2e6ef] bg-[#fbfcfe] px-4 py-3">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#8a4cfc]" />
                        <p className="text-xs leading-relaxed text-[#464652]">{s.analysis.aiFeedbackSummary}</p>
                      </div>
                    )}

                    <a
                      href="/student/logbook"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#712ae2] transition-colors hover:text-[#5a1fc0]"
                    >
                      View entry <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

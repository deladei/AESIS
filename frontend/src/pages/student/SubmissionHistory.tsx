import { useState } from 'react';
import { ChevronRight, CheckCircle2, AlertCircle, Lock, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions } from '@/hooks/useLogbook';

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
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                done
                  ? status === 'flagged' && i === 3
                    ? 'border-red-500 bg-red-500/20'
                    : 'border-blue-500 bg-blue-500/20'
                  : 'border-slate-700 bg-slate-800'
              }`}>
                {done && (
                  status === 'flagged' && i === 3
                    ? <AlertCircle className="w-3 h-3 text-red-400" />
                    : <CheckCircle2 className="w-3 h-3 text-blue-400" />
                )}
              </div>
              <span className="text-xs text-slate-500 mt-1 whitespace-nowrap hidden sm:block" style={{ fontSize: 9 }}>{s}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`h-px w-8 sm:w-12 mx-1 ${i < step ? 'bg-blue-500' : 'bg-slate-700'}`} />
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
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  const sorted = [...submissions].sort((a, b) => b.weekNumber - a.weekNumber);
  const submitted = submissions.filter((s) => s.submissionStatus !== 'not_submitted' && s.submissionStatus !== 'draft');
  const approved  = submissions.filter((s) => s.submissionStatus === 'approved');
  const flagged   = submissions.filter((s) => s.submissionStatus === 'flagged');
  const total     = submissions.length;
  const progress  = total > 0 ? Math.round((submitted.length / total) * 100) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Submission History</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {submitted.length} submitted · {flagged.length} flagged
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Programme Progress</span>
          <span className="text-sm font-mono text-blue-400">{submitted.length} / {total} weeks</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Approved ({approved.length})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Flagged ({flagged.length})</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600" />Remaining ({total - submitted.length})</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-10">No submission records found for your placement.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((s) => {
            const isOpen    = selectedId === s.id;
            const upcoming  = s.submissionStatus === 'not_submitted';
            const quality   = s.analysis?.qualityScore ?? null;

            return (
              <div key={s.id} className={`bg-slate-900 border rounded-xl overflow-hidden ${
                upcoming ? 'border-slate-800 opacity-60' : 'border-slate-800'
              }`}>
                <button
                  onClick={() => !upcoming && setSelectedId(isOpen ? null : s.id)}
                  disabled={upcoming}
                  className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
                    upcoming ? 'cursor-default' : 'cursor-pointer hover:bg-slate-800/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                    upcoming
                      ? 'bg-slate-800 border-slate-700'
                      : s.submissionStatus === 'flagged'
                        ? 'bg-red-500/10 border-red-500/30'
                        : s.submissionStatus === 'approved'
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-blue-500/10 border-blue-500/30'
                  }`}>
                    {upcoming
                      ? <Lock className="w-4 h-4 text-slate-600" />
                      : <span className={`text-xs font-bold font-mono ${
                          s.submissionStatus === 'flagged' ? 'text-red-400' : s.submissionStatus === 'approved' ? 'text-emerald-400' : 'text-blue-400'
                        }`}>W{s.weekNumber}</span>
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-200">Week {s.weekNumber}</span>
                      {s.isLate && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400">LATE</span>
                      )}
                      {upcoming
                        ? <span className="text-xs text-slate-500">Due {formatDeadline(s.deadline)}</span>
                        : <StatusBadge type="submission" status={s.submissionStatus as any} />
                      }
                    </div>
                    <span className="text-xs text-slate-500">
                      {s.submittedAt
                        ? `Submitted ${formatDeadline(s.submittedAt)}`
                        : `Due ${formatDeadline(s.deadline)}`}
                    </span>
                  </div>

                  {quality !== null && (
                    <span className={`font-mono text-sm font-bold shrink-0 ${
                      quality >= 75 ? 'text-emerald-400' : quality >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {quality}/100
                    </span>
                  )}

                  {!upcoming && (
                    <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                  )}
                </button>

                {isOpen && !upcoming && (
                  <div className="px-5 pb-5 border-t border-slate-800 pt-4">
                    <div className="flex items-center justify-center mb-4">
                      <FlowTracker status={s.submissionStatus} aiStatus={s.aiAnalysisStatus} />
                    </div>
                    <div className="flex gap-3">
                      <a
                        href="/student/logbook"
                        className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                      >
                        View entry <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                      {s.aiAnalysisStatus === 'completed' && s.analysis?.aiFeedbackSummary && (
                        <p className="text-xs text-slate-500 ml-4 truncate max-w-xs">{s.analysis.aiFeedbackSummary}</p>
                      )}
                    </div>
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

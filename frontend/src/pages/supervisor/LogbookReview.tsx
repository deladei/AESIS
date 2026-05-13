import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, ChevronDown, ChevronUp, Flag, ArrowUpRight } from 'lucide-react';
import { useSubmission, useSubmitFeedback } from '@/hooks/useLogbook';

function InfoSection({ label, content }: { label: string; content: string | null }) {
  const [open, setOpen] = useState(true);
  if (!content) return null;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left cursor-pointer hover:bg-slate-800/30 transition-colors"
      >
        <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-sm text-slate-300 leading-relaxed">{content}</p>
        </div>
      )}
    </div>
  );
}

export default function LogbookReview() {
  const [searchParams] = useSearchParams();
  const submissionId   = searchParams.get('submissionId') ?? undefined;

  const { data: sub, isLoading } = useSubmission(submissionId);
  const submitFeedback = useSubmitFeedback();

  const [feedbackText, setFeedbackText] = useState('');
  const [action,       setAction]       = useState<'approve' | 'flag' | null>(null);
  const [done,         setDone]         = useState(false);
  const [aiDraft,      setAiDraft]      = useState(false);

  const handleAction = async (outcome: 'approved' | 'flagged') => {
    if (!feedbackText.trim() || !submissionId) return;
    setAction(outcome === 'approved' ? 'approve' : 'flag');
    try {
      await submitFeedback.mutateAsync({ submissionId, feedbackText, outcome });
      setDone(true);
    } finally {
      setAction(null);
    }
  };

  const loadAIDraft = () => {
    if (!sub) return;
    const name = sub.student ? `${sub.student.firstName}` : 'Student';
    setAiDraft(true);
    setFeedbackText(
      `${name}, your logbook entry for Week ${sub.weekNumber} lacks the technical specificity expected at this stage of your placement. Task descriptions should name specific functions, modules, or algorithms you worked with. Please revise to include specific technologies, code-level decisions, and what you would do differently next time.`
    );
  };

  if (!submissionId) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-4" />
        <h2 className="text-white font-semibold text-lg mb-2">No submission selected</h2>
        <p className="text-slate-400 text-sm">
          Navigate here from a student's submission row. The URL should include a <code className="text-slate-300">?submissionId=...</code> parameter.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  if (!sub) {
    return <div className="p-6 text-center text-slate-500 py-20">Submission not found.</div>;
  }

  const a          = sub.analysis;
  const totalScore = a?.rubric?.reduce((s, r) => s + r.score, 0) ?? a?.qualityScore ?? 0;
  const studentName = sub.student ? `${sub.student.firstName} ${sub.student.lastName}` : '—';
  const company     = sub.placement?.company?.name ?? '—';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">{studentName}</h1>
            {sub.isLate && (
              <span className="text-xs px-2 py-0.5 rounded font-mono bg-red-500/10 border border-red-500/30 text-red-400">LATE</span>
            )}
          </div>
          <p className="text-slate-400 text-sm">
            Week {sub.weekNumber} Logbook · {company}
            {sub.submittedAt && ` · Submitted ${new Date(sub.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        {/* Risk badge if available from supervisor dashboard context */}
      </div>

      {done && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-emerald-300 text-sm font-medium">Feedback submitted successfully.</p>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Left: student entry + feedback */}
        <div className="lg:col-span-3 space-y-4">
          {sub.technologiesUsed?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Technologies Used</p>
              <div className="flex flex-wrap gap-2">
                {sub.technologiesUsed.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          <InfoSection label="Tasks Completed"    content={sub.tasksCompleted}      />
          <InfoSection label="Technical Challenges" content={sub.technicalChallenges} />
          <InfoSection label="Reflection"           content={sub.reflection}          />

          {!done && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-white">Supervisor Feedback</p>
                {!aiDraft && a?.aiFeedbackSummary && (
                  <button
                    onClick={loadAIDraft}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-600/30 text-blue-300 text-xs font-medium hover:bg-blue-600/30 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Use AI draft
                  </button>
                )}
              </div>
              <textarea
                rows={6}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Write structured feedback for the student…"
                className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none scrollbar-thin"
              />
              <div className="flex gap-3 mt-3">
                <button
                  onClick={() => handleAction('approved')}
                  disabled={!feedbackText.trim() || submitFeedback.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitFeedback.isPending && action === 'approve'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />}
                  Approve
                </button>
                <button
                  onClick={() => handleAction('flagged')}
                  disabled={!feedbackText.trim() || submitFeedback.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitFeedback.isPending && action === 'flag'
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Flag className="w-4 h-4" />}
                  Flag & Return
                </button>
              </div>
              <button className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-700 text-amber-400 hover:bg-amber-500/10 text-sm font-semibold transition-colors cursor-pointer">
                <ArrowUpRight className="w-4 h-4" /> Escalate to Coordinator
              </button>
            </div>
          )}
        </div>

        {/* Right: AI analysis */}
        <div className="lg:col-span-2 space-y-4">
          {a ? (
            <>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">AI Analysis</h3>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <div className="relative w-20 h-20 shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#1e293b" strokeWidth="7" />
                      <circle
                        cx="40" cy="40" r="32" fill="none"
                        stroke={totalScore >= 75 ? '#10b981' : totalScore >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="7"
                        strokeDasharray={`${2 * Math.PI * 32 * (totalScore / 100)} ${2 * Math.PI * 32}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-white font-mono">{totalScore}</span>
                    </div>
                  </div>
                  {a.rubric && (
                    <div className="space-y-2 flex-1">
                      {a.rubric.map((r) => (
                        <div key={r.label}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs text-slate-500 truncate">{r.label}</span>
                            <span className="text-xs font-mono text-slate-400 ml-2 shrink-0">{r.score}/{r.max}</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1">
                            <div
                              className={`h-1 rounded-full ${(r.score/r.max) >= 0.7 ? 'bg-emerald-500' : (r.score/r.max) >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${(r.score / r.max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                    a.isPlagiarismFlagged
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {a.isPlagiarismFlagged ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>Plagiarism: {a.plagiarismSimilarity !== null ? `${(a.plagiarismSimilarity * 100).toFixed(0)}% similarity` : 'n/a'}</span>
                    {a.isPlagiarismFlagged && <span className="ml-auto font-semibold">FLAGGED</span>}
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                    a.isRelevanceFlagged
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {a.isRelevanceFlagged ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>CS Relevance: {a.relevanceScore !== null ? `${(a.relevanceScore * 100).toFixed(0)}%` : 'n/a'}</span>
                    {a.isRelevanceFlagged && <span className="ml-auto font-semibold">LOW</span>}
                  </div>
                </div>
              </div>

              {a.aiFeedbackSummary && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">AI Feedback Summary</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{a.aiFeedbackSummary}</p>
                </div>
              )}

              {a.shapFactors && a.shapFactors.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Risk SHAP Factors</p>
                  <div className="space-y-3">
                    {a.shapFactors.map((f) => (
                      <div key={f.factor}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs text-slate-400">{f.factor}</span>
                          <span className={`text-xs font-mono ${f.contribution < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{f.contribution.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${f.contribution < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(Math.abs(f.contribution) * 400, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-3">
                    SHAP values show each feature's contribution to this student's risk score.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center py-10">
              <Loader2 className="w-6 h-6 text-slate-600 mx-auto mb-3 animate-spin" />
              <p className="text-slate-500 text-xs">AI analysis in progress or not yet available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

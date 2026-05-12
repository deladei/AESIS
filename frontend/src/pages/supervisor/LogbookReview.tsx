import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, ChevronDown, ChevronUp, Flag, ArrowUpRight } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';

const submission = {
  student: { name: 'Chioma Okafor', programme: 'B.Sc. Software Engineering', company: 'TechBridge Ltd' },
  week: 8,
  submittedAt: '8 May 2025, 22:41',
  isLate: true,
  content: {
    technologiesUsed: ['React', 'Node.js', 'PostgreSQL', 'Git'],
    tasksCompleted:
      'This week I worked on several things at TechBridge. I was helping the team with some coding tasks and also attended some meetings. The work involved writing code for the frontend and also doing some backend things. I also fixed some bugs that the team asked me to fix.',
    challenges:
      'There were some challenges this week. I had to figure out some technical issues that came up during development. It was a bit hard but eventually I managed to resolve them with help from colleagues.',
    reflection:
      'This week was a learning experience. I think I improved my skills and learned new things about software development. Overall it was a productive week.',
  },
  analysis: {
    qualityScore: 48,
    relevanceScore: 0.62,
    isRelevanceFlagged: true,
    plagiarismSimilarity: 0.41,
    isPlagiarismFlagged: true,
    authenticityFlag: false,
    aiFeedbackSummary:
      'Task descriptions lack technical specificity. Phrases like "some coding tasks" and "backend things" do not demonstrate CS-relevant vocabulary or depth. Reflection quality is below rubric threshold — no specific learning outcomes or technical concepts are named. The CS relevance classifier flagged insufficient technical terminology. Plagiarism similarity (0.41) exceeds the 0.35 threshold; matches found against 2 prior submissions in the cohort index.',
    rubric: [
      { label: 'Task Description Depth', score: 10, max: 30 },
      { label: 'Technical Vocabulary',   score: 12, max: 25 },
      { label: 'Reflection Quality',     score: 14, max: 25 },
      { label: 'Temporal Consistency',   score: 12, max: 20 },
    ],
    shapFactors: [
      { factor: 'Submission frequency ↓',   contribution: -0.14 },
      { factor: 'Low quality score (avg)',   contribution: -0.11 },
      { factor: 'Plagiarism flag count ↑',  contribution: -0.09 },
    ],
  },
};

export default function LogbookReview() {
  const [feedbackText, setFeedbackText] = useState('');
  const [aiDraft, setAiDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ tasks: true, challenges: true, reflection: true });
  const [action, setAction] = useState<'approve' | 'flag' | null>(null);

  const toggle = (s: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }));

  const loadAIDraft = () => {
    setAiDraft(true);
    setFeedbackText(
      'Chioma, your logbook entry for Week 8 lacks the technical specificity expected at this stage of your placement. Task descriptions should name specific functions, modules, or algorithms you worked with — not general activities. Your reflection does not identify concrete learning outcomes. Please revise to include specific technologies, code-level decisions, and what you would do differently next time. Note: a plagiarism similarity above our threshold was detected; ensure all content is your own original writing.'
    );
  };

  const handleSubmit = async () => {
    if (!feedbackText.trim() || !action) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSubmitting(false);
    // navigate back
  };

  const a = submission.analysis;
  const totalScore = a.rubric.reduce((s, r) => s + r.score, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white">{submission.student.name}</h1>
            {submission.isLate && (
              <span className="text-xs px-2 py-0.5 rounded font-mono bg-red-500/10 border border-red-500/30 text-red-400">LATE</span>
            )}
          </div>
          <p className="text-slate-400 text-sm">
            Week {submission.week} Logbook · {submission.student.company} · Submitted {submission.submittedAt}
          </p>
        </div>
        <RiskBadge tier="high" score={0.74} showScore />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Left: Student entry — 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          {/* Technologies */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Technologies Used</p>
            <div className="flex flex-wrap gap-2">
              {submission.content.technologiesUsed.map((t) => (
                <span key={t} className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Collapsible sections */}
          {([
            { key: 'tasks' as const, label: 'Tasks Completed', content: submission.content.tasksCompleted },
            { key: 'challenges' as const, label: 'Technical Challenges', content: submission.content.challenges },
            { key: 'reflection' as const, label: 'Reflection', content: submission.content.reflection },
          ]).map(({ key, label, content }) => (
            <div key={key} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(key)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left cursor-pointer hover:bg-slate-800/30 transition-colors"
              >
                <span className="text-xs text-slate-500 uppercase tracking-wide font-semibold">{label}</span>
                {expandedSections[key] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {expandedSections[key] && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-slate-300 leading-relaxed">{content}</p>
                </div>
              )}
            </div>
          ))}

          {/* Feedback form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Supervisor Feedback</p>
              {!aiDraft && (
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
                onClick={() => { setAction('approve'); handleSubmit(); }}
                disabled={!feedbackText.trim() || submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
              <button
                onClick={() => { setAction('flag'); handleSubmit(); }}
                disabled={!feedbackText.trim() || submitting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                Flag & Return
              </button>
            </div>
            <button
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-700 text-amber-400 hover:bg-amber-500/10 text-sm font-semibold transition-colors cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" /> Escalate to Coordinator
            </button>
          </div>
        </div>

        {/* Right: AI Analysis panel — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* Score */}
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
            </div>

            {/* Flags */}
            <div className="space-y-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                a.isPlagiarismFlagged
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {a.isPlagiarismFlagged ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                <span>Plagiarism: {(a.plagiarismSimilarity * 100).toFixed(0)}% similarity</span>
                {a.isPlagiarismFlagged && <span className="ml-auto font-semibold">FLAGGED</span>}
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                a.isRelevanceFlagged
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {a.isRelevanceFlagged ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                <span>CS Relevance: {(a.relevanceScore * 100).toFixed(0)}%</span>
                {a.isRelevanceFlagged && <span className="ml-auto font-semibold">LOW</span>}
              </div>
            </div>
          </div>

          {/* AI Feedback summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-2">AI Feedback Summary</p>
            <p className="text-xs text-slate-300 leading-relaxed">{a.aiFeedbackSummary}</p>
          </div>

          {/* SHAP Risk Factors */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">Risk SHAP Factors</p>
            <div className="space-y-3">
              {a.shapFactors.map((f) => (
                <div key={f.factor}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-slate-400">{f.factor}</span>
                    <span className="text-xs font-mono text-red-400">{f.contribution.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div
                      className="bg-red-500 h-1.5 rounded-full"
                      style={{ width: `${Math.abs(f.contribution) * 400}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-3">
              SHAP values show each feature's contribution to this student's risk score.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

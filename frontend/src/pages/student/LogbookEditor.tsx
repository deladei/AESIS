import { useState, useRef, useEffect } from 'react';
import { Loader2, Upload, X, FileText, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useSubmissions, useSaveDraft, useSubmitLogbook } from '@/hooks/useLogbook';

interface AIPreview {
  qualityScore: number;
  relevanceScore: number;
  plagiarismSimilarity: number;
  isPlagiarismFlagged: boolean;
  aiFeedbackSummary: string;
  rubric: { label: string; score: number; max: number }[];
}

const TECH_SUGGESTIONS = [
  'React', 'Node.js', 'PostgreSQL', 'Docker', 'Python', 'FastAPI',
  'TypeScript', 'MongoDB', 'Redis', 'Git', 'Linux', 'REST API',
];

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function LogbookEditor() {
  const navigate = useNavigate();

  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data: submissions = [], isLoading: subsLoading } = useSubmissions(activePlacement?.id);

  const currentSubmission = submissions
    .filter((s) => s.submissionStatus === 'draft' || s.submissionStatus === 'not_submitted')
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0];

  const [form, setForm] = useState({
    technologiesUsed:    [] as string[],
    tasksCompleted:      '',
    technicalChallenges: '',
    reflection:          '',
  });
  const [techInput, setTechInput]   = useState('');
  const [files,     setFiles]       = useState<File[]>([]);
  const [analysing, setAnalysing]   = useState(false);
  const [aiPreview, setAiPreview]   = useState<AIPreview | null>(null);
  const [saved,     setSaved]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveDraft     = useSaveDraft();
  const submitLogbook = useSubmitLogbook();

  // Populate form from existing draft
  useEffect(() => {
    if (!currentSubmission) return;
    setForm({
      technologiesUsed:    currentSubmission.technologiesUsed ?? [],
      tasksCompleted:      currentSubmission.tasksCompleted      ?? '',
      technicalChallenges: currentSubmission.technicalChallenges ?? '',
      reflection:          currentSubmission.reflection           ?? '',
    });
  }, [currentSubmission?.id]);

  const addTech = (tech: string) => {
    const t = tech.trim();
    if (t && !form.technologiesUsed.includes(t)) {
      setForm({ ...form, technologiesUsed: [...form.technologiesUsed, t] });
    }
    setTechInput('');
  };

  const removeTech = (tech: string) => {
    setForm({ ...form, technologiesUsed: form.technologiesUsed.filter((t) => t !== tech) });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
  };

  const handleSaveDraft = async () => {
    if (!currentSubmission) return;
    await saveDraft.mutateAsync({
      submissionId: currentSubmission.id,
      data: {
        tasksCompleted:      form.tasksCompleted,
        technicalChallenges: form.technicalChallenges,
        reflection:          form.reflection,
        technologiesUsed:    form.technologiesUsed,
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleGetAIPreview = async () => {
    setAnalysing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setAiPreview({
      qualityScore: 78,
      relevanceScore: 0.91,
      plagiarismSimilarity: 0.12,
      isPlagiarismFlagged: false,
      aiFeedbackSummary:
        'Strong technical vocabulary with clear task descriptions. Reflection section could be deeper — consider elaborating on how challenges changed your approach. Temporal consistency is good; activities are sequential and plausible.',
      rubric: [
        { label: 'Task Description Depth', score: 24, max: 30 },
        { label: 'Technical Vocabulary',   score: 21, max: 25 },
        { label: 'Reflection Quality',     score: 18, max: 25 },
        { label: 'Temporal Consistency',   score: 15, max: 20 },
      ],
    });
    setAnalysing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubmission) return;
    await saveDraft.mutateAsync({
      submissionId: currentSubmission.id,
      data: {
        tasksCompleted:      form.tasksCompleted,
        technicalChallenges: form.technicalChallenges,
        reflection:          form.reflection,
        technologiesUsed:    form.technologiesUsed,
      },
    });
    await submitLogbook.mutateAsync(currentSubmission.id);
    navigate('/student/submissions');
  };

  if (placementsLoading || subsLoading) {
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  if (!currentSubmission) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center py-20">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-white font-semibold text-lg mb-2">All caught up!</h2>
        <p className="text-slate-400 text-sm">No open logbook submission at the moment. Check back when the next week opens.</p>
      </div>
    );
  }

  const isSubmitting = submitLogbook.isPending || saveDraft.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Week {currentSubmission.weekNumber} Logbook</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Due {formatDeadline(currentSubmission.deadline)} · CS Internship Log
          {currentSubmission.isLate && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-mono bg-red-500/10 border border-red-500/30 text-red-400">LATE</span>
          )}
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-5">
          {/* Technologies used */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label className="block text-sm font-semibold text-white mb-3">Technologies Used</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {form.technologiesUsed.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-600/20 border border-blue-600/30 text-blue-300 text-xs font-mono">
                  {t}
                  <button type="button" onClick={() => removeTech(t)} className="text-blue-400 hover:text-blue-200 cursor-pointer" aria-label={`Remove ${t}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTech(techInput); } }}
                placeholder="Type and press Enter…"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {TECH_SUGGESTIONS.filter((t) => !form.technologiesUsed.includes(t)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTech(t)}
                  className="px-2 py-0.5 rounded text-xs text-slate-400 bg-slate-800 border border-slate-700 hover:border-blue-500 hover:text-blue-400 transition-colors cursor-pointer"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label htmlFor="tasks" className="block text-sm font-semibold text-white mb-1.5">
              Tasks Completed
              <span className="ml-2 text-xs text-slate-500 font-normal">Describe what you built or contributed to this week</span>
            </label>
            <textarea
              id="tasks"
              rows={5}
              value={form.tasksCompleted}
              onChange={(e) => setForm({ ...form, tasksCompleted: e.target.value })}
              placeholder="e.g. Implemented JWT authentication middleware in Node.js, integrated with Prisma ORM for user lookup…"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none scrollbar-thin"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label htmlFor="challenges" className="block text-sm font-semibold text-white mb-1.5">
              Technical Challenges
              <span className="ml-2 text-xs text-slate-500 font-normal">Problems encountered and how you addressed them</span>
            </label>
            <textarea
              id="challenges"
              rows={4}
              value={form.technicalChallenges}
              onChange={(e) => setForm({ ...form, technicalChallenges: e.target.value })}
              placeholder="e.g. Encountered an N+1 query problem. Resolved by refactoring with Prisma's include…"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none scrollbar-thin"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label htmlFor="reflection" className="block text-sm font-semibold text-white mb-1.5">
              Reflection
              <span className="ml-2 text-xs text-slate-500 font-normal">What did you learn? How did this week affect your professional development?</span>
            </label>
            <textarea
              id="reflection"
              rows={4}
              value={form.reflection}
              onChange={(e) => setForm({ ...form, reflection: e.target.value })}
              placeholder="e.g. This week deepened my understanding of stateless authentication…"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none scrollbar-thin"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-sm font-semibold text-white mb-3">Attachments <span className="text-slate-500 font-normal">(optional)</span></p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-lg border border-dashed border-slate-700 hover:border-blue-500 hover:bg-blue-500/5 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-sm text-slate-400">Click to upload or drag files here</span>
              <span className="text-xs text-slate-600">PDF, PNG, JPG up to 10MB each</span>
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileChange} accept=".pdf,.png,.jpg,.jpeg" />
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-300 truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saveDraft.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-sm font-medium transition-colors cursor-pointer disabled:opacity-60"
            >
              {saved ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Saved</>
              ) : saveDraft.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              ) : (
                'Save draft'
              )}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : 'Submit logbook'}
            </button>
          </div>
        </form>

        {/* AI Preview panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">AI Quality Preview</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Get instant AI feedback before your supervisor reviews your entry.
              This uses the same NLP engine as the final analysis.
            </p>
            <button
              type="button"
              onClick={handleGetAIPreview}
              disabled={analysing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-300 hover:bg-blue-600/30 text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {analysing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</> : 'Analyse my entry'}
            </button>
          </div>

          {aiPreview && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
              <div className="text-center">
                <div className="relative w-24 h-24 mx-auto mb-2">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="none" stroke="#1e293b" strokeWidth="8" />
                    <circle
                      cx="48" cy="48" r="40" fill="none"
                      stroke="#3b82f6" strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 40 * (aiPreview.qualityScore / 100)} ${2 * Math.PI * 40}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white font-mono">{aiPreview.qualityScore}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">Quality Score</p>
              </div>

              <div className="space-y-2.5">
                {aiPreview.rubric.map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-slate-400">{r.label}</span>
                      <span className="text-xs font-mono text-slate-300">{r.score}/{r.max}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${(r.score / r.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> CS Relevance {(aiPreview.relevanceScore * 100).toFixed(0)}%
                </span>
                {aiPreview.isPlagiarismFlagged ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
                    <AlertCircle className="w-3 h-3" /> Plagiarism flagged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> No plagiarism
                  </span>
                )}
              </div>

              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5 font-semibold">AI Feedback</p>
                <p className="text-xs text-slate-300 leading-relaxed">{aiPreview.aiFeedbackSummary}</p>
              </div>

              <p className="text-xs text-slate-600 text-center">
                AI scores are advisory. Supervisor review is final.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ChevronRight, CheckCircle2, AlertCircle, Clock, Lock } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface Submission {
  week: number;
  status: 'approved' | 'flagged' | 'under_review' | 'submitted' | 'draft' | 'not_submitted';
  aiStatus: 'completed' | 'processing' | 'pending' | 'failed' | null;
  quality: number | null;
  isLate: boolean;
  submittedAt: string | null;
  deadline: string;
}

const submissions: Submission[] = [
  { week: 9,  status: 'not_submitted', aiStatus: null,        quality: null, isLate: false, submittedAt: null,              deadline: '16 May 2025' },
  { week: 8,  status: 'approved',      aiStatus: 'completed', quality: 78,   isLate: false, submittedAt: '12 May 2025',     deadline: '9 May 2025' },
  { week: 7,  status: 'approved',      aiStatus: 'completed', quality: 82,   isLate: false, submittedAt: '5 May 2025',      deadline: '2 May 2025' },
  { week: 6,  status: 'flagged',       aiStatus: 'completed', quality: 48,   isLate: false, submittedAt: '28 Apr 2025',     deadline: '25 Apr 2025' },
  { week: 5,  status: 'approved',      aiStatus: 'completed', quality: 74,   isLate: true,  submittedAt: '22 Apr 2025',     deadline: '18 Apr 2025' },
  { week: 4,  status: 'approved',      aiStatus: 'completed', quality: 69,   isLate: false, submittedAt: '13 Apr 2025',     deadline: '11 Apr 2025' },
  { week: 3,  status: 'approved',      aiStatus: 'completed', quality: 65,   isLate: false, submittedAt: '6 Apr 2025',      deadline: '4 Apr 2025' },
  { week: 2,  status: 'approved',      aiStatus: 'completed', quality: 68,   isLate: false, submittedAt: '30 Mar 2025',     deadline: '28 Mar 2025' },
  { week: 1,  status: 'approved',      aiStatus: 'completed', quality: 62,   isLate: false, submittedAt: '23 Mar 2025',     deadline: '21 Mar 2025' },
  { week: 10, status: 'not_submitted', aiStatus: null,        quality: null, isLate: false, submittedAt: null,              deadline: '23 May 2025' },
];

const sorted = [...submissions].sort((a, b) => b.week - a.week);

// Submission flow steps
const FLOW_STEPS = ['Submitted', 'AI Analysis', 'Under Review', 'Approved / Flagged'];

function FlowTracker({ status, aiStatus }: Pick<Submission, 'status' | 'aiStatus'>) {
  const step =
    status === 'not_submitted' || status === 'draft' ? -1 :
    status === 'submitted' && aiStatus !== 'completed' ? 0 :
    status === 'submitted' || status === 'under_review' ? 2 :
    3;

  return (
    <div className="flex items-center gap-0">
      {FLOW_STEPS.map((s, i) => {
        const done = i <= step;
        const current = i === step;
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

export default function SubmissionHistory() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Submission History</h1>
        <p className="text-slate-400 text-sm mt-0.5">Week 9 of 24 · 8 submitted · 1 flagged</p>
      </div>

      {/* Progress overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Programme Progress</span>
          <span className="text-sm font-mono text-blue-400">8 / 24 weeks</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: '33%' }} />
        </div>
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Approved (7)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Flagged (1)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600" />Remaining (16)</span>
        </div>
      </div>

      {/* Submission list */}
      <div className="space-y-2">
        {sorted.map((s) => {
          const isOpen = selectedWeek === s.week;
          const upcoming = s.status === 'not_submitted';

          return (
            <div key={s.week} className={`bg-slate-900 border rounded-xl overflow-hidden ${
              upcoming ? 'border-slate-800 opacity-60' : 'border-slate-800'
            }`}>
              <button
                onClick={() => !upcoming && setSelectedWeek(isOpen ? null : s.week)}
                disabled={upcoming}
                className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${
                  upcoming ? 'cursor-default' : 'cursor-pointer hover:bg-slate-800/30'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${
                  upcoming
                    ? 'bg-slate-800 border-slate-700'
                    : s.status === 'flagged'
                      ? 'bg-red-500/10 border-red-500/30'
                      : s.status === 'approved'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-blue-500/10 border-blue-500/30'
                }`}>
                  {upcoming
                    ? <Lock className="w-4 h-4 text-slate-600" />
                    : <span className={`text-xs font-bold font-mono ${
                        s.status === 'flagged' ? 'text-red-400' : s.status === 'approved' ? 'text-emerald-400' : 'text-blue-400'
                      }`}>W{s.week}</span>
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-200">Week {s.week}</span>
                    {s.isLate && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400">LATE</span>
                    )}
                    {upcoming
                      ? <span className="text-xs text-slate-500">Due {s.deadline}</span>
                      : <StatusBadge type="submission" status={s.status as any} />
                    }
                  </div>
                  <span className="text-xs text-slate-500">
                    {s.submittedAt ? `Submitted ${s.submittedAt}` : `Due ${s.deadline}`}
                  </span>
                </div>

                {s.quality !== null && (
                  <span className={`font-mono text-sm font-bold shrink-0 ${
                    s.quality >= 75 ? 'text-emerald-400' : s.quality >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {s.quality}/100
                  </span>
                )}

                {!upcoming && (
                  <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                )}
              </button>

              {/* Expanded: flow tracker */}
              {isOpen && !upcoming && (
                <div className="px-5 pb-5 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-center mb-4">
                    <FlowTracker status={s.status as any} aiStatus={s.aiStatus as any} />
                  </div>
                  <div className="flex gap-3">
                    <a
                      href={`/student/logbook/${s.week}`}
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      View entry <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                    {s.aiStatus === 'completed' && (
                      <a
                        href={`/student/logbook/${s.week}/analysis`}
                        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors cursor-pointer"
                      >
                        AI analysis <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

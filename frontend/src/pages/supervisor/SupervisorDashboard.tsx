import { useState } from 'react';
import { Users, AlertTriangle, ClipboardCheck, ChevronRight, Filter, Loader2 } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { useSupervisorDashboard } from '@/hooks/useDashboard';

type RiskTier = 'low' | 'medium' | 'high';

const weekStatusConfig: Record<string, { label: string; classes: string }> = {
  approved:     { label: 'Approved',  classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  submitted:    { label: 'Submitted', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  under_review: { label: 'In Review', classes: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  pending:      { label: 'Pending',   classes: 'bg-slate-700/50 text-slate-400 border-slate-600' },
  late:         { label: 'Late',      classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
  flagged:      { label: 'Flagged',   classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

function latestStatus(recentWeeks: { week: number; status: string; score: number | null }[]) {
  if (!recentWeeks.length) return 'pending';
  const sorted = [...recentWeeks].sort((a, b) => b.week - a.week);
  return sorted[0].status;
}

function formatLastActivity(iso: string | null) {
  if (!iso) return 'No submissions';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  return `${Math.floor(diff / 86_400_000)} days ago`;
}

export default function SupervisorDashboard() {
  const { data, isLoading } = useSupervisorDashboard();
  const [filterTier, setFilterTier] = useState<RiskTier | 'all'>('all');

  if (isLoading) {
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  const overview  = data?.overview  ?? { assignedStudents: 0, pendingReview: 0, avgQualityScore: null };
  const students  = data?.students  ?? [];

  const highRisk = students.filter((s) => s.riskTier === 'high');
  const filtered = filterTier === 'all' ? students : students.filter((s) => s.riskTier === filterTier);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Supervisor Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">{overview.assignedStudents} assigned students</p>
      </div>

      {highRisk.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-red-300 font-semibold text-sm mb-1">
                {highRisk.length} student{highRisk.length > 1 ? 's' : ''} in High Risk
              </p>
              <p className="text-red-400/70 text-xs">
                {highRisk.map((s) => `${s.student.firstName} ${s.student.lastName}`).join(', ')} — immediate intervention recommended
              </p>
            </div>
            <a href="/supervisor/alerts" className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer shrink-0">
              View alerts <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Students',  value: overview.assignedStudents,                              icon: Users,          color: 'text-blue-400'   },
          { label: 'High Risk',       value: highRisk.length,                                        icon: AlertTriangle,  color: 'text-red-400'    },
          { label: 'Pending Reviews', value: overview.pendingReview,                                 icon: ClipboardCheck, color: 'text-amber-400'  },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <span className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-white">Assigned Students</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">Risk tier:</span>
            {(['all', 'high', 'medium', 'low'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterTier(t)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize ${
                  filterTier === t
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-600/40'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No students in this tier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Student', 'Email', 'Risk', 'Avg Quality', 'Latest Status', 'Last Active', ''].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map((s) => {
                  const name    = `${s.student.firstName} ${s.student.lastName}`;
                  const status  = latestStatus(s.recentWeeks);
                  const wsCfg   = weekStatusConfig[status] ?? weekStatusConfig.pending;
                  const quality = s.avgQualityScore;

                  return (
                    <tr key={s.placementId} className="hover:bg-slate-800/30 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-slate-400 font-mono">
                              {name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <span className="text-sm text-slate-200 font-medium whitespace-nowrap">{name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-500">{s.student.email}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {s.riskTier
                          ? <RiskBadge tier={s.riskTier} score={s.riskScore ?? undefined} size="sm" showScore />
                          : <span className="text-xs text-slate-500">—</span>
                        }
                      </td>
                      <td className="px-5 py-3.5">
                        {quality !== null ? (
                          <span className={`font-mono text-sm font-semibold ${
                            quality >= 75 ? 'text-emerald-400' : quality >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {quality.toFixed(0)}/100
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full border text-xs px-2.5 py-0.5 font-medium ${wsCfg.classes}`}>
                          {wsCfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-slate-500">{formatLastActivity(s.lastSubmittedAt)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <a
                          href="/supervisor/review"
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-all cursor-pointer whitespace-nowrap"
                        >
                          Review <ChevronRight className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, TrendingUp, CheckCircle2, AlertTriangle, BookOpen, ChevronRight } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';

const qualityTrend = [
  { week: 'Wk 1', score: 62 },
  { week: 'Wk 2', score: 68 },
  { week: 'Wk 3', score: 71 },
  { week: 'Wk 4', score: 65 },
  { week: 'Wk 5', score: 74 },
  { week: 'Wk 6', score: 79 },
  { week: 'Wk 7', score: 82 },
  { week: 'Wk 8', score: 78 },
];

const recentSubmissions = [
  { week: 8, status: 'approved' as const, quality: 78, submittedAt: '12 May 2025', late: false },
  { week: 7, status: 'approved' as const, quality: 82, submittedAt: '5 May 2025',  late: false },
  { week: 6, status: 'flagged'  as const, quality: 79, submittedAt: '28 Apr 2025', late: false },
  { week: 5, status: 'approved' as const, quality: 74, submittedAt: '21 Apr 2025', late: true  },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className="text-blue-400 font-semibold font-mono">{payload[0].value}/100</p>
    </div>
  );
};

export default function StudentDashboard() {
  const complianceRate = 87.5;
  const currentRisk: 'low' | 'medium' | 'high' = 'low';
  const daysToDeadline = 3;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">Week 9 of 24 · Industrial Placement</p>
      </div>

      {/* Deadline banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="text-amber-300 text-sm">
          <span className="font-semibold">Week 9 logbook due in {daysToDeadline} days</span>
          {' '}— Friday 16 May 2025 at 23:59
        </p>
        <a
          href="/student/logbook"
          className="ml-auto flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors cursor-pointer shrink-0"
        >
          Submit now <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Current Risk"
          value={<RiskBadge tier={currentRisk} size="sm" />}
          sub="Updated weekly"
          icon={<AlertTriangle className="w-4 h-4 text-slate-400" />}
        />
        <StatCard
          label="Avg Quality Score"
          value={<span className="font-mono text-blue-400 text-2xl font-bold">74.9</span>}
          sub="Out of 100"
          icon={<TrendingUp className="w-4 h-4 text-slate-400" />}
        />
        <StatCard
          label="Compliance Rate"
          value={<span className="font-mono text-emerald-400 text-2xl font-bold">{complianceRate}%</span>}
          sub="7 of 8 on time"
          icon={<CheckCircle2 className="w-4 h-4 text-slate-400" />}
        />
        <StatCard
          label="Submissions"
          value={<span className="font-mono text-slate-200 text-2xl font-bold">8 / 24</span>}
          sub="Weeks complete"
          icon={<BookOpen className="w-4 h-4 text-slate-400" />}
        />
      </div>

      {/* Chart + Risk breakdown */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Quality trend */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Quality Score Trend</h2>
              <p className="text-slate-500 text-xs mt-0.5">NLP-scored logbook quality · last 8 weeks</p>
            </div>
            <span className="text-xs text-slate-500 font-mono">0 – 100</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={qualityTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#60a5fa', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Risk explanation */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Risk Factors</h2>
          <p className="text-slate-500 text-xs mb-4">SHAP top-3 contributors to your risk score</p>
          <div className="space-y-3">
            {[
              { factor: 'Submission Frequency', impact: 0.08, positive: true },
              { factor: 'Avg Quality Score',    impact: 0.12, positive: true },
              { factor: 'Supervisor Sentiment', impact: 0.05, positive: true },
            ].map((f) => (
              <div key={f.factor}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 text-xs">{f.factor}</span>
                  <span className={`text-xs font-mono ${f.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {f.positive ? '▼' : '▲'} {f.impact.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${f.positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${f.impact * 300}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800">
            <p className="text-slate-500 text-xs">
              Risk score is computed weekly using XGBoost across 18 behavioural signals.
              AI is advisory — not final.
            </p>
          </div>
        </div>
      </div>

      {/* Recent submissions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Recent Submissions</h2>
          <a href="/student/submissions" className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
            View all
          </a>
        </div>
        <div className="divide-y divide-slate-800">
          {recentSubmissions.map((s) => (
            <div key={s.week} className="flex items-center gap-4 px-5 py-3.5">
              <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <span className="text-slate-300 text-xs font-mono font-semibold">W{s.week}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-200 font-medium">Week {s.week}</span>
                  {s.late && (
                    <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
                      LATE
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{s.submittedAt}</span>
              </div>
              <span className="font-mono text-sm text-blue-400 font-semibold shrink-0">{s.quality}/100</span>
              <StatusBadge type="submission" status={s.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: {
  label: string; value: React.ReactNode; sub: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mb-1">{value}</div>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

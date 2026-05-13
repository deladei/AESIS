import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Users, TrendingUp, CheckCircle2, ChevronRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { useCoordinatorDashboard, useCoordinatorStudents } from '@/hooks/useDashboard';


const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className="text-blue-400 font-semibold font-mono">{payload[0].value}% on-time</p>
    </div>
  );
};

const RADIAN = Math.PI / 180;
const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600} fontFamily="'Fira Code', monospace">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const PIE_COLORS = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };

export default function CoordinatorDashboard() {
  const { data, isLoading } = useCoordinatorDashboard();
  const { data: studentsData } = useCoordinatorStudents(1, 'high');

  if (isLoading) {
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  const overview = data?.overview ?? { activePlacements: 0, pendingApprovals: 0, complianceRate: 0, highRiskCount: 0 };
  const riskDist = data?.riskDistribution ?? { low: 0, medium: 0, high: 0 };
  const trends   = data?.submissionTrends ?? [];
  const highRiskStudents = studentsData?.students ?? [];

  const pieData = [
    { name: 'Low',    value: riskDist.low,    color: PIE_COLORS.low    },
    { name: 'Medium', value: riskDist.medium, color: PIE_COLORS.medium },
    { name: 'High',   value: riskDist.high,   color: PIE_COLORS.high   },
  ].filter((d) => d.value > 0);

  const complianceWeekly = trends.slice(-6).map((t) => ({
    week: `Wk ${t.week}`,
    rate: t.scheduled > 0 ? Math.round((t.submitted / t.scheduled) * 100) : 0,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cohort Health Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">AY 2024/2025 · CS Department · Week 9 of 24</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-600/40 text-blue-300 hover:bg-blue-600/30 text-sm font-medium transition-colors cursor-pointer">
          <ArrowUpRight className="w-4 h-4" /> Generate Report
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Students',   value: overview.activePlacements,         sub: 'On placement',               color: 'text-slate-200',   icon: Users,         border: 'border-slate-800' },
          { label: 'Submission Rate',   value: `${overview.complianceRate}%`,      sub: 'Logbook compliance',         color: 'text-blue-400',    icon: CheckCircle2,  border: 'border-blue-800/30' },
          { label: 'High Risk',         value: overview.highRiskCount,             sub: 'Require intervention',       color: 'text-red-400',     icon: AlertTriangle, border: 'border-red-800/30' },
          { label: 'Pending Approvals', value: overview.pendingApprovals,          sub: 'Awaiting coordinator action',color: 'text-emerald-400', icon: TrendingUp,    border: 'border-emerald-800/30' },
        ].map((s) => (
          <div key={s.label} className={`bg-slate-900 border ${s.border} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">{s.label}</span>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-3xl font-bold font-mono mb-1 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Compliance bar chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Weekly Submission Compliance</h2>
          <p className="text-slate-500 text-xs mb-5">Percentage of active students who submitted on time</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={complianceWeekly} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[70, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="rate" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Risk donut */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Risk Distribution</h2>
          <p className="text-slate-500 text-xs mb-3">Cohort-wide risk tier breakdown</p>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                dataKey="value"
                labelLine={false}
                label={renderCustomLabel}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {pieData.map((r) => (
              <div key={r.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-xs text-slate-400">{r.name} ({r.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* High risk alert feed */}
      <div className="bg-slate-900 border border-red-500/20 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-semibold text-white">High Risk Alerts</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 font-mono">{highRiskStudents.length}</span>
          </div>
          <a href="/coordinator/alerts" className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
            View all
          </a>
        </div>
        <div className="divide-y divide-slate-800/50">
          {highRiskStudents.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">No high-risk students at this time.</p>
          ) : highRiskStudents.map((s) => {
            const name = `${s.student.firstName} ${s.student.lastName}`;
            return (
              <div key={s.placementId} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/20 transition-colors group">
                <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                  <span className="text-red-400 text-xs font-semibold font-mono">
                    {name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm text-slate-200 font-medium">{name}</span>
                    <RiskBadge tier="high" score={s.riskScore ?? undefined} size="sm" showScore />
                  </div>
                  <p className="text-xs text-slate-500">
                    Week {s.lastWeek ?? '—'} · Status: {s.lastStatus ?? 'unknown'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Company performance */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white mb-0.5">Company Performance</h2>
          <p className="text-slate-500 text-xs">Detailed per-company analytics with quality scores and trend data</p>
        </div>
        <a
          href="/coordinator/companies"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-medium transition-colors cursor-pointer"
        >
          View analytics
        </a>
      </div>
    </div>
  );
}

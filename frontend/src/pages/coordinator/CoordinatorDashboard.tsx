import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { AlertTriangle, Users, TrendingUp, CheckCircle2, ChevronRight, ArrowUpRight } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';

const riskDistribution = [
  { name: 'Low',    value: 68, color: '#10b981' },
  { name: 'Medium', value: 24, color: '#f59e0b' },
  { name: 'High',   value: 8,  color: '#ef4444' },
];

const complianceWeekly = [
  { week: 'Wk 4', rate: 91 },
  { week: 'Wk 5', rate: 88 },
  { week: 'Wk 6', rate: 85 },
  { week: 'Wk 7', rate: 89 },
  { week: 'Wk 8', rate: 86 },
  { week: 'Wk 9', rate: 82 },
];

const highRiskStudents = [
  { id: '1', name: 'Chioma Okafor',    supervisor: 'Dr. Emeka Obi',     riskScore: 0.74, company: 'TechBridge Ltd',    lastAlert: '2h ago',   topFactor: 'Low submission quality' },
  { id: '2', name: 'Tobechukwu Nduka', supervisor: 'Dr. Amara Kalu',    riskScore: 0.71, company: 'DataFlow Systems',  lastAlert: '5h ago',   topFactor: 'Missed 2 consecutive weeks' },
  { id: '3', name: 'Yusuf Suleiman',   supervisor: 'Dr. Ngozi Eze',     riskScore: 0.68, company: 'CoreTech Ltd',      lastAlert: '1 day ago', topFactor: 'Supervisor sentiment declining' },
];

const companyPerformance = [
  { company: 'InnovatePH',          students: 12, avgQuality: 84, avgRisk: 0.18, trend: '+3' },
  { company: 'ByteHouse Africa',    students: 9,  avgQuality: 79, avgRisk: 0.22, trend: '+1' },
  { company: 'SecureNet Solutions', students: 7,  avgQuality: 73, avgRisk: 0.38, trend: '-2' },
  { company: 'DataSync Nigeria',    students: 11, avgQuality: 68, avgRisk: 0.44, trend: '-5' },
  { company: 'TechBridge Ltd',      students: 8,  avgQuality: 54, avgRisk: 0.61, trend: '-8' },
];

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

export default function CoordinatorDashboard() {
  const totalStudents = 100;

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
          { label: 'Active Students',    value: totalStudents, sub: 'On placement this week',      color: 'text-slate-200',   icon: Users,          border: 'border-slate-800' },
          { label: 'Submission Rate',    value: '82%',         sub: '82 of 100 submitted Wk 9',    color: 'text-blue-400',    icon: CheckCircle2,   border: 'border-blue-800/30' },
          { label: 'High Risk',          value: 8,             sub: 'Require urgent intervention',  color: 'text-red-400',     icon: AlertTriangle,  border: 'border-red-800/30' },
          { label: 'Avg Quality Score',  value: '72.4',        sub: '+4.1 vs last cohort',          color: 'text-emerald-400', icon: TrendingUp,     border: 'border-emerald-800/30' },
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
                data={riskDistribution}
                cx="50%" cy="50%"
                innerRadius={45} outerRadius={70}
                dataKey="value"
                labelLine={false}
                label={renderCustomLabel}
              >
                {riskDistribution.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-2">
            {riskDistribution.map((r) => (
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
          {highRiskStudents.map((s) => (
            <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/20 transition-colors group">
              <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                <span className="text-red-400 text-xs font-semibold font-mono">
                  {s.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm text-slate-200 font-medium">{s.name}</span>
                  <RiskBadge tier="high" score={s.riskScore} size="sm" showScore />
                </div>
                <p className="text-xs text-slate-500">
                  {s.company} · Supervisor: {s.supervisor} · Top factor: <span className="text-red-400">{s.topFactor}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500 mb-1">{s.lastAlert}</p>
                <a
                  href={`/coordinator/students/${s.id}`}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  View <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Company performance table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Company Performance</h2>
          <a href="/coordinator/companies" className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
            Full analytics
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {['Company', 'Students', 'Avg Quality', 'Avg Risk', 'vs Last Cohort'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {companyPerformance.map((c) => (
                <tr key={c.company} className="hover:bg-slate-800/20 transition-colors">
                  <td className="px-5 py-3.5 text-sm text-slate-200 font-medium whitespace-nowrap">{c.company}</td>
                  <td className="px-5 py-3.5 text-sm font-mono text-slate-400">{c.students}</td>
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-sm font-semibold ${
                      c.avgQuality >= 75 ? 'text-emerald-400' :
                      c.avgQuality >= 60 ? 'text-amber-400' : 'text-red-400'
                    }`}>{c.avgQuality}/100</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <RiskBadge
                      tier={c.avgRisk < 0.3 ? 'low' : c.avgRisk < 0.6 ? 'medium' : 'high'}
                      score={c.avgRisk}
                      size="sm"
                      showScore
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`font-mono text-sm font-semibold ${c.trend.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {c.trend}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

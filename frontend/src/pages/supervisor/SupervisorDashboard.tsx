import { useState } from 'react';
import { Users, AlertTriangle, ClipboardCheck, Clock, ChevronRight, Filter } from 'lucide-react';
import { RiskBadge } from '@/components/shared/RiskBadge';
import { StatusBadge } from '@/components/shared/StatusBadge';

type RiskTier = 'low' | 'medium' | 'high';

interface Student {
  id: string;
  name: string;
  programme: string;
  company: string;
  riskTier: RiskTier;
  riskScore: number;
  latestQuality: number;
  weekStatus: 'submitted' | 'pending' | 'late' | 'approved';
  weekNumber: number;
  lastActivity: string;
}

const students: Student[] = [
  { id: '1', name: 'Chioma Okafor',   programme: 'B.Sc. Software Engineering', company: 'TechBridge Ltd',       riskTier: 'high',   riskScore: 0.74, latestQuality: 48, weekStatus: 'late',      weekNumber: 8, lastActivity: '4 days ago' },
  { id: '2', name: 'Emmanuel Eze',    programme: 'B.Sc. Computer Science',      company: 'DataSync Nigeria',     riskTier: 'medium', riskScore: 0.51, latestQuality: 63, weekStatus: 'submitted', weekNumber: 9, lastActivity: '2 days ago' },
  { id: '3', name: 'Fatima Abdullahi',programme: 'B.Sc. Information Tech',      company: 'InnovatePH',           riskTier: 'low',    riskScore: 0.18, latestQuality: 84, weekStatus: 'approved',  weekNumber: 9, lastActivity: 'Today'      },
  { id: '4', name: 'Kelechi Nwachukwu',programme:'B.Sc. Computer Science',     company: 'ByteHouse Africa',     riskTier: 'low',    riskScore: 0.22, latestQuality: 79, weekStatus: 'approved',  weekNumber: 9, lastActivity: 'Yesterday'  },
  { id: '5', name: 'Ngozi Uchenna',   programme: 'B.Sc. Cybersecurity',         company: 'SecureNet Solutions',  riskTier: 'medium', riskScore: 0.44, latestQuality: 70, weekStatus: 'submitted', weekNumber: 9, lastActivity: '1 day ago'  },
  { id: '6', name: 'Tunde Adesanya',  programme: 'B.Sc. Software Engineering',  company: 'CodeCraft Studios',    riskTier: 'low',    riskScore: 0.09, latestQuality: 91, weekStatus: 'approved',  weekNumber: 9, lastActivity: 'Today'      },
];

const weekStatusConfig = {
  approved:  { label: 'Approved',   classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  submitted: { label: 'Submitted',  classes: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  pending:   { label: 'Pending',    classes: 'bg-slate-700/50 text-slate-400 border-slate-600' },
  late:      { label: 'Late',       classes: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

export default function SupervisorDashboard() {
  const [filterTier, setFilterTier] = useState<RiskTier | 'all'>('all');

  const highRisk = students.filter((s) => s.riskTier === 'high');
  const filtered = filterTier === 'all' ? students : students.filter((s) => s.riskTier === filterTier);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Supervisor Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">Week 9 of 24 · {students.length} assigned students</p>
      </div>

      {/* High risk alert banner */}
      {highRisk.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 glow-red">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-red-300 font-semibold text-sm mb-1">
                {highRisk.length} student{highRisk.length > 1 ? 's' : ''} in High Risk
              </p>
              <p className="text-red-400/70 text-xs">
                {highRisk.map((s) => s.name).join(', ')} — immediate intervention recommended
              </p>
            </div>
            <a href="/supervisor/alerts" className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium transition-colors cursor-pointer shrink-0">
              View alerts <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students',   value: students.length, icon: Users,          color: 'text-blue-400' },
          { label: 'High Risk',        value: students.filter(s=>s.riskTier==='high').length,   icon: AlertTriangle,   color: 'text-red-400' },
          { label: 'Pending Reviews',  value: students.filter(s=>s.weekStatus==='submitted').length, icon: ClipboardCheck, color: 'text-amber-400' },
          { label: 'Late This Week',   value: students.filter(s=>s.weekStatus==='late').length,  icon: Clock,           color: 'text-orange-400' },
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

      {/* Students table */}
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                {['Student', 'Programme', 'Company', 'Risk', 'Quality', 'Wk 9 Status', 'Last Active', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map((s) => {
                const ws = weekStatusConfig[s.weekStatus];
                return (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-slate-400 font-mono">
                            {s.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <span className="text-sm text-slate-200 font-medium whitespace-nowrap">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-400 whitespace-nowrap">{s.programme.replace('B.Sc. ', '')}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-400 whitespace-nowrap">{s.company}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <RiskBadge tier={s.riskTier} score={s.riskScore} size="sm" showScore />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`font-mono text-sm font-semibold ${
                        s.latestQuality >= 75 ? 'text-emerald-400' :
                        s.latestQuality >= 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {s.latestQuality}/100
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full border text-xs px-2.5 py-0.5 font-medium ${ws.classes}`}>
                        {ws.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-500">{s.lastActivity}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={`/supervisor/students/${s.id}`}
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
      </div>
    </div>
  );
}

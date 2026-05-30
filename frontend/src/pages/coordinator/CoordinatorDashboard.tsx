import {
  Users, Clock, BarChart3, Briefcase, TrendingUp, Filter, MoreVertical,
  Landmark, Eye, Check, Sparkles, RefreshCw, Star,
} from 'lucide-react';

/**
 * Coordinator Dashboard — "Nexus Oversight" Stitch design.
 *
 * NOTE: static demo data for now (Ghanaian names) — to be wired to live
 * coordinator analytics later. Chrome (sidebar + topbar) comes from CoordinatorShell.
 */

const metrics = [
  { label: 'Active Interns',     value: '1,284', icon: Users,     sub: '+12% from last month',   tone: 'text-emerald-600', trend: true },
  { label: 'Pending Placements', value: '42',    icon: Clock,     sub: '8 require urgent review', tone: 'text-amber-600' },
  { label: 'Avg Performance',    value: '94.2',  icon: BarChart3, bar: 94 },
  { label: 'Open Project Slots', value: '156',   icon: Briefcase, sub: 'Across 24 partner companies', tone: 'text-[#757684]' },
];

const interns = [
  { name: 'Akosua Mensah',   id: '#INT-8902', dept: 'Data Engineering',   supervisor: 'Dr. Kofi Adjei', phase: 'Phase 2: Modeling', pct: 65, tone: 'text-[#00288e]',    bar: 'bg-[#00288e]' },
  { name: 'Kwabena Boateng', id: '#INT-4421', dept: 'Product UX',         supervisor: 'Dr. Ama Owusu',  phase: 'Phase 4: Handoff',  pct: 92, tone: 'text-emerald-600',   bar: 'bg-emerald-500' },
  { name: 'Yaw Asante',      id: '#INT-2109', dept: 'Cloud Architecture', supervisor: 'Dr. Yaw Darko',  phase: 'Phase 1: Research', pct: 28, tone: 'text-amber-600',     bar: 'bg-amber-500' },
];

const requests = [
  { org: 'University of Ghana', detail: '12 Candidates · CS Dept' },
  { org: 'KNUST',               detail: '8 Candidates · AI Lab' },
];

const matches = [
  { name: 'Kojo Antwi', pct: 98 },
  { name: 'Efua Adjei', pct: 94 },
];

const activity = [
  { time: '10:42 AM',  dot: 'bg-[#00288e]', body: <><strong>Dr. Ama Owusu</strong> submitted a mid-term review for <strong>Kwabena Boateng</strong>.</>, badge: { icon: Star, text: 'Excellent rating', tone: 'text-emerald-600' } },
  { time: '09:15 AM',  dot: 'bg-amber-500', body: <>System alert: <strong>KNUST</strong> requested profile revisions for 4 students.</>, action: 'Fix errors' },
  { time: 'Yesterday', dot: 'bg-[#757684]', body: <>Project <strong>"Adinkra Mesh"</strong> has been marked 100% completed.</> },
  { time: 'Yesterday', dot: 'bg-[#00288e]', body: <>New internship opening: <strong>FinTech AI Specialist</strong> at <strong>Korle Labs</strong>.</>, note: '14 matches found' },
];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function CoordinatorDashboard() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-[#00288e]">Dashboard</p>
          <h2 className="text-4xl font-bold tracking-tight text-[#0b1c30]">
            Nexus Oversight <span className="text-xl font-normal text-[#757684]">v4.2</span>
          </h2>
        </div>
        <div className="hidden gap-3 sm:flex">
          <button className="rounded-lg border border-[#c4c5d5] px-4 py-2 text-sm font-semibold text-[#0b1c30] transition-colors hover:bg-[#e5eeff]">
            Export report
          </button>
          <button className="rounded-lg bg-[#00288e] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90">
            View live feed
          </button>
        </div>
      </div>

      {/* Metrics */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="flex flex-col justify-between rounded-xl border border-[#c4c5d5]/60 bg-white p-6">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold tracking-wide text-[#757684]">{m.label}</span>
                <Icon className="h-5 w-5 text-[#00288e]" />
              </div>
              <div className="mt-4">
                <p className="text-4xl font-bold text-[#0b1c30]">{m.value}</p>
                {m.bar != null ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                    <div className="h-full rounded-full bg-[#00288e]" style={{ width: `${m.bar}%` }} />
                  </div>
                ) : (
                  <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${m.tone}`}>
                    {m.trend && <TrendingUp className="h-4 w-4" />}{m.sub}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* Left column */}
        <div className="col-span-12 space-y-4 lg:col-span-8">
          {/* Intern Status Monitor */}
          <div className="overflow-hidden rounded-xl border border-[#c4c5d5]/60 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#c4c5d5]/60 bg-[#f8f9ff] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#00288e]">Intern Status Monitor</h3>
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#00288e]/10 px-2 py-1 text-[11px] font-semibold text-[#00288e]">Live</span>
                <button aria-label="Filter interns" className="text-[#444653] transition-colors hover:text-[#00288e]">
                  <Filter className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#eff4ff]">
                  <tr className="text-xs font-semibold tracking-wide text-[#757684]">
                    <th className="px-6 py-3">Intern</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Supervisor</th>
                    <th className="px-4 py-3">Project milestone</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c4c5d5]/50">
                  {interns.map((i) => (
                    <tr key={i.id} className="transition-colors hover:bg-[#eff4ff]">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dde1ff] text-[11px] font-bold text-[#00288e]">{initials(i.name)}</div>
                          <div>
                            <p className="text-sm font-bold leading-tight text-[#0b1c30]">{i.name}</p>
                            <p className="font-mono text-xs text-[#757684]">{i.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#0b1c30]">{i.dept}</td>
                      <td className="px-4 py-3 text-sm text-[#0b1c30]">{i.supervisor}</td>
                      <td className="px-4 py-3">
                        <div className="w-40">
                          <div className="mb-1 flex justify-between text-[10px]">
                            <span className={`font-bold ${i.tone}`}>{i.phase}</span>
                            <span className="text-[#757684]">{i.pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                            <div className={`h-full ${i.bar}`} style={{ width: `${i.pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button aria-label={`Actions for ${i.name}`} className="text-[#757684] transition-colors hover:text-[#00288e]"><MoreVertical className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center border-t border-[#c4c5d5]/60 bg-[#f8f9ff] py-4">
              <button className="text-sm font-semibold text-[#00288e] hover:underline">View all 1,284 interns</button>
            </div>
          </div>

          {/* Requests + AI matching */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#c4c5d5]/60 bg-white p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#00288e]">Placement Requests</h3>
                  <p className="text-xs text-[#757684]">New institutional applications</p>
                </div>
                <span className="rounded-full bg-[#00288e] px-2 py-0.5 text-[10px] font-bold text-white">4 new</span>
              </div>
              <div className="space-y-4">
                {requests.map((r) => (
                  <div key={r.org} className="flex items-center justify-between rounded-lg border border-[#c4c5d5]/60 p-3 transition-colors hover:border-[#00288e]/40">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-[#e5eeff]"><Landmark className="h-5 w-5 text-[#00288e]" /></div>
                      <div>
                        <p className="text-sm font-bold text-[#0b1c30]">{r.org}</p>
                        <p className="text-xs text-[#757684]">{r.detail}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button aria-label={`Review ${r.org} request`} className="flex h-8 w-8 items-center justify-center rounded border border-[#c4c5d5]/60 transition-colors hover:bg-[#dce9ff]"><Eye className="h-[18px] w-[18px] text-[#444653]" /></button>
                      <button aria-label={`Approve ${r.org} request`} className="flex h-8 w-8 items-center justify-center rounded bg-[#00288e] text-white transition-opacity hover:opacity-90"><Check className="h-[18px] w-[18px]" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI matching */}
            <div className="relative overflow-hidden rounded-xl bg-[#00288e] p-6 text-white">
              <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#645efb] opacity-20 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#89ceff]" />
                  <h3 className="text-lg font-semibold">AI Pulse Matching</h3>
                </div>
                <p className="mb-4 text-xs text-[#dde1ff]">
                  Highest-precision matches for the 'Senior Backend Intern' role at <span className="font-bold underline">Ananse Technologies</span>.
                </p>
                <div className="space-y-2">
                  {matches.map((m) => (
                    <div key={m.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/10 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">{initials(m.name)}</div>
                        <div>
                          <p className="text-sm font-bold">{m.name}</p>
                          <div className="flex items-center gap-1">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/20">
                              <div className="h-full bg-emerald-400" style={{ width: `${m.pct}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-emerald-400">{m.pct}% Match</span>
                          </div>
                        </div>
                      </div>
                      <button className="rounded bg-white px-2 py-1 text-[10px] font-bold text-[#00288e]">Invite</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Activity */}
        <div className="col-span-12 lg:col-span-4">
          <div className="flex h-full flex-col rounded-xl border border-[#c4c5d5]/60 bg-white">
            <div className="flex items-center justify-between border-b border-[#c4c5d5]/60 bg-[#f8f9ff] px-6 py-4">
              <h3 className="text-lg font-semibold text-[#00288e]">Recent Activity</h3>
              <button aria-label="Refresh activity" className="text-[#757684] hover:text-[#00288e]"><RefreshCw className="h-[18px] w-[18px]" /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {activity.map((a, idx) => {
                const Badge = a.badge?.icon;
                return (
                  <div key={idx} className="relative border-l border-[#c4c5d5]/60 pl-6">
                    <div className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ${a.dot} ring-4 ring-white`} />
                    <p className="mb-1 text-xs font-semibold tracking-wide text-[#757684]">{a.time}</p>
                    <div className="rounded-lg bg-[#eff4ff] p-3">
                      <p className="text-sm text-[#0b1c30]">{a.body}</p>
                      {a.badge && Badge && (
                        <div className={`mt-2 flex items-center gap-1.5 ${a.badge.tone}`}>
                          <Badge className="h-3.5 w-3.5" fill="currentColor" />
                          <span className="text-xs font-semibold">{a.badge.text}</span>
                        </div>
                      )}
                      {a.action && <button className="mt-2 text-xs font-semibold text-[#00288e] underline">{a.action}</button>}
                      {a.note && <p className="mt-1 text-xs font-semibold text-[#00288e]">{a.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[#c4c5d5]/60 p-4">
              <button className="w-full rounded-lg border border-[#c4c5d5]/60 py-2 text-sm font-semibold text-[#444653] transition-colors hover:text-[#00288e]">
                View full audit log
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

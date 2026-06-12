import { Link } from 'react-router-dom';
import {
  Users, Clock, BarChart3, Briefcase, TrendingUp, Filter, MoreVertical,
  Landmark, Eye, Check, Sparkles, RefreshCw, Loader2, AlertCircle, Inbox,
} from 'lucide-react';
import {
  useCoordinatorDashboard, useCoordinatorStudents, useCoordinatorActivity,
  type CoordinatorStudent,
} from '@/hooks/useDashboard';
import { useAllPlacements } from '@/hooks/usePlacements';

/**
 * Coordinator Dashboard — "Nexus Oversight" Stitch design, wired to live data.
 * Chrome (sidebar + topbar) comes from CoordinatorShell.
 *
 * Backed by: /coordinator/dashboard (metrics, risk, trends),
 * /coordinator/students (intern table), /coordinator/activity (audit feed),
 * and pending placements via /placements?status=pending (Placement Requests).
 * The "AI Pulse Matching" panel has no backing feature and is marked Sample.
 */

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const tierBar:  Record<string, string> = { low: 'bg-emerald-500', medium: 'bg-amber-500', high: 'bg-red-500' };
const tierText: Record<string, string> = { low: 'text-emerald-600', medium: 'text-amber-600', high: 'text-red-600' };

function SampleBadge() {
  return (
    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
      Sample
    </span>
  );
}

function InternRow({ s }: { s: CoordinatorStudent }) {
  const name = `${s.student.firstName} ${s.student.lastName}`;
  const tier = s.riskTier ?? '';
  return (
    <tr className="transition-colors hover:bg-[#eff4ff]">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e1e0ff] text-[11px] font-bold text-[#15157d]">{initials(name)}</div>
          <div>
            <p className="text-sm font-bold leading-tight text-[#0b1c30]">{name}</p>
            <p className="font-mono text-xs text-[#757684]">#{s.placementId.slice(0, 6).toUpperCase()}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#0b1c30]">{s.department ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-[#0b1c30]">{s.supervisor?.name ?? <span className="text-[#757684]">Unassigned</span>}</td>
      <td className="px-4 py-3">
        <div className="w-40">
          <div className="mb-1 flex justify-between text-[10px]">
            <span className={`font-bold ${tierText[tier] ?? 'text-[#15157d]'}`}>
              Week {s.lastWeek ?? 0} of {s.totalWeeks || 6}
            </span>
            <span className="text-[#757684]">{s.progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
            <div className={`h-full ${tierBar[tier] ?? 'bg-[#15157d]'}`} style={{ width: `${s.progressPct}%` }} />
          </div>
        </div>
      </td>
      <td className="px-6 py-3 text-right">
        <Link to="/coordinator/assignments" aria-label={`Manage ${name}`} className="inline-flex text-[#757684] transition-colors hover:text-[#15157d]">
          <MoreVertical className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

export default function CoordinatorDashboard() {
  const { data: dash, isLoading: dashLoading, isError: dashError, refetch: refetchDash } = useCoordinatorDashboard();
  const { data: studentsData, isLoading: studentsLoading } = useCoordinatorStudents(1);
  const { data: pending } = useAllPlacements(1, 'pending');
  const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useCoordinatorActivity(8);

  const students       = studentsData?.students ?? [];
  const totalInterns   = (studentsData?.meta as { total?: number } | undefined)?.total ?? students.length;
  const pendingList    = pending?.placements ?? [];

  const ov = dash?.overview;
  const metrics = [
    { label: 'Active Interns',    value: ov ? ov.activePlacements.toLocaleString() : '—', icon: Users,     sub: 'Currently on placement', tone: 'text-[#757684]' },
    { label: 'Pending Placements', value: ov ? String(ov.pendingApprovals) : '—',         icon: Clock,     sub: ov?.pendingApprovals ? 'Awaiting your review' : 'All caught up', tone: 'text-amber-600' },
    { label: 'Avg Performance',   value: ov?.avgPerformance != null ? ov.avgPerformance.toFixed(1) : '—', icon: BarChart3, bar: ov?.avgPerformance ?? 0 },
    { label: 'Partner Companies', value: ov ? String(ov.partnerCompanies) : '—',          icon: Briefcase, sub: 'Hosting active placements', tone: 'text-[#757684]' },
  ];

  if (dashError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-[#444653]">Couldn't load the coordinator dashboard.</p>
        <button onClick={() => refetchDash()} className="rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-[#15157d]">Dashboard</p>
          <h2 className="text-4xl font-bold tracking-tight text-[#0b1c30]">Nexus Oversight</h2>
        </div>
        <div className="hidden gap-3 sm:flex">
          <Link to="/coordinator/placements" className="rounded-lg border border-[#c4c5d5] px-4 py-2 text-sm font-semibold text-[#0b1c30] transition-colors hover:bg-[#e5eeff]">
            Review placements
          </Link>
          <Link to="/coordinator/assignments" className="rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90">
            Manage assignments
          </Link>
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
                <Icon className="h-5 w-5 text-[#15157d]" />
              </div>
              <div className="mt-4">
                <p className="text-4xl font-bold text-[#0b1c30]">{dashLoading ? '—' : m.value}</p>
                {'bar' in m ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                    <div className="h-full rounded-full bg-[#15157d]" style={{ width: `${m.bar}%` }} />
                  </div>
                ) : (
                  <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${m.tone}`}>
                    {m.label === 'Active Interns' && <TrendingUp className="h-4 w-4" />}{m.sub}
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
              <h3 className="text-lg font-semibold text-[#15157d]">Intern Status Monitor</h3>
              <div className="flex items-center gap-2">
                <span className="rounded bg-[#15157d]/10 px-2 py-1 text-[11px] font-semibold text-[#15157d]">Live</span>
                <button aria-label="Filter interns" className="text-[#444653] transition-colors hover:text-[#15157d]">
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
                    <th className="px-4 py-3">Logbook progress</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c4c5d5]/50">
                  {studentsLoading ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[#15157d]" /></td></tr>
                  ) : students.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-[#757684]">No active interns yet.</td></tr>
                  ) : (
                    students.map((s) => <InternRow key={s.placementId} s={s} />)
                  )}
                </tbody>
              </table>
            </div>
            {students.length > 0 && (
              <div className="flex justify-center border-t border-[#c4c5d5]/60 bg-[#f8f9ff] py-4">
                <Link to="/coordinator/assignments" className="text-sm font-semibold text-[#15157d] hover:underline">
                  View all {totalInterns.toLocaleString()} interns
                </Link>
              </div>
            )}
          </div>

          {/* Requests + AI matching */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-[#c4c5d5]/60 bg-white p-6">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#15157d]">Placement Requests</h3>
                  <p className="text-xs text-[#757684]">Awaiting approval</p>
                </div>
                {pendingList.length > 0 && (
                  <span className="rounded-full bg-[#15157d] px-2 py-0.5 text-[10px] font-bold text-white">{pendingList.length} new</span>
                )}
              </div>
              <div className="space-y-4">
                {pendingList.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <Inbox className="h-6 w-6 text-[#c4c5d5]" />
                    <p className="text-sm text-[#757684]">No pending requests.</p>
                  </div>
                ) : pendingList.slice(0, 4).map((p) => {
                  const studentName = p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown student';
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-[#c4c5d5]/60 p-3 transition-colors hover:border-[#15157d]/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-[#e5eeff]"><Landmark className="h-5 w-5 text-[#15157d]" /></div>
                        <div>
                          <p className="text-sm font-bold text-[#0b1c30]">{p.company?.name ?? 'Unassigned company'}</p>
                          <p className="text-xs text-[#757684]">{studentName}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link to="/coordinator/placements" aria-label={`Review ${studentName}'s placement`} className="flex h-8 w-8 items-center justify-center rounded border border-[#c4c5d5]/60 transition-colors hover:bg-[#dce9ff]"><Eye className="h-[18px] w-[18px] text-[#444653]" /></Link>
                        <Link to="/coordinator/placements" aria-label={`Approve ${studentName}'s placement`} className="flex h-8 w-8 items-center justify-center rounded bg-[#15157d] text-white transition-opacity hover:opacity-90"><Check className="h-[18px] w-[18px]" /></Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI matching — no backing feature yet; clearly marked Sample */}
            <div className="relative overflow-hidden rounded-xl bg-[#15157d] p-6 text-white">
              <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#645efb] opacity-20 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#89ceff]" />
                    <h3 className="text-lg font-semibold">AI Pulse Matching</h3>
                  </div>
                  <SampleBadge />
                </div>
                <p className="mb-4 text-xs text-[#e1e0ff]">
                  Candidate–role matching is on the roadmap. The figures below are illustrative only.
                </p>
                <div className="space-y-2">
                  {[{ name: 'Kojo Antwi', pct: 98 }, { name: 'Efua Adjei', pct: 94 }].map((m) => (
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
                      <button disabled className="cursor-not-allowed rounded bg-white/60 px-2 py-1 text-[10px] font-bold text-[#15157d]">Invite</button>
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
              <h3 className="text-lg font-semibold text-[#15157d]">Recent Activity</h3>
              <button onClick={() => refetchActivity()} aria-label="Refresh activity" className="text-[#757684] hover:text-[#15157d]"><RefreshCw className="h-[18px] w-[18px]" /></button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {activityLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#15157d]" /></div>
              ) : !activity || activity.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Inbox className="h-6 w-6 text-[#c4c5d5]" />
                  <p className="text-sm text-[#757684]">No recent activity.</p>
                </div>
              ) : activity.map((a) => (
                <div key={a.id} className="relative border-l border-[#c4c5d5]/60 pl-6">
                  <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-[#15157d] ring-4 ring-white" />
                  <p className="mb-1 text-xs font-semibold tracking-wide text-[#757684]">{relativeTime(a.createdAt)}</p>
                  <div className="rounded-lg bg-[#eff4ff] p-3">
                    <p className="text-sm text-[#0b1c30]"><strong>{a.actor}</strong> · {a.summary}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#c4c5d5]/60 p-4">
              <Link to="/coordinator/placements" className="block w-full rounded-lg border border-[#c4c5d5]/60 py-2 text-center text-sm font-semibold text-[#444653] transition-colors hover:text-[#15157d]">
                View placements
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

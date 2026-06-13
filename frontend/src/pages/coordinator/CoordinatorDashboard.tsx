import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Clock, BarChart3, Briefcase, TrendingUp,
  Landmark, Eye, Check, Sparkles, RefreshCw, Loader2, AlertCircle, Inbox, AlertTriangle, FileDown,
} from 'lucide-react';
import { useCoordinatorDashboard, useCoordinatorActivity, useCoordinatorCohorts } from '@/hooks/useDashboard';
import { useAllPlacements } from '@/hooks/usePlacements';
import InternStatusTable from '@/components/coordinator/InternStatusTable';
import SupervisorWorkloadPanel from '@/components/coordinator/SupervisorWorkloadPanel';
import PerformanceDistributionModal from '@/components/coordinator/PerformanceDistributionModal';

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

function RoadmapBadge() {
  return (
    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-300">
      Roadmap
    </span>
  );
}


export default function CoordinatorDashboard() {
  // Cohort scope (item 17) — '' means the whole active population.
  const [yearId, setYearId] = useState('');
  const scopeYearId = yearId || undefined;
  // Performance distribution modal (item 15), opened from the Avg Performance card.
  const [showDistribution, setShowDistribution] = useState(false);

  const { data: dash, isLoading: dashLoading, isError: dashError, refetch: refetchDash } = useCoordinatorDashboard(scopeYearId);
  const { data: pending } = useAllPlacements(1, 'pending');
  const { data: activity, isLoading: activityLoading, refetch: refetchActivity } = useCoordinatorActivity(8);
  const { data: cohorts = [] } = useCoordinatorCohorts();

  const pendingList = pending?.placements ?? [];

  const ov = dash?.overview;
  // AI Pulse Matching is a roadmap feature gated by a backend flag (off in prod).
  const aiMatchingEnabled = dash?.featureFlags?.aiPulseMatching ?? false;
  const metrics = [
    { label: 'Active Interns',    value: ov ? ov.activePlacements.toLocaleString() : '—', icon: Users,     sub: 'Currently on placement', tone: 'text-[#757684]' },
    { label: 'Pending Placements', value: ov ? String(ov.pendingApprovals) : '—',         icon: Clock,     sub: ov?.pendingApprovals ? 'Awaiting your review' : 'All caught up', tone: 'text-amber-600' },
    { label: 'Avg Performance',   value: ov?.avgPerformance != null ? ov.avgPerformance.toFixed(1) : '—', icon: BarChart3, bar: ov?.avgPerformance ?? 0, onClick: () => setShowDistribution(true) },
    { label: 'Needs Attention',   value: ov ? String(ov.needsAttention) : '—',            icon: AlertTriangle, sub: ov?.needsAttention ? 'Review flagged interns' : 'All on track', tone: ov?.needsAttention ? 'text-[#b3261e]' : 'text-[#1b7a45]', to: '/coordinator/interns?attention=1' },
    { label: 'Host Companies',    value: ov ? String(ov.hostCompanies) : '—',             icon: Briefcase, sub: 'Currently hosting interns', tone: 'text-[#757684]' },
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
        <div className="flex flex-wrap items-center gap-3">
          {/* Cohort scope (item 17) — scopes every metric, the workload panel,
              the distribution, the intern table, and exports below. */}
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            aria-label="Scope dashboard to a cohort"
            className="rounded-lg border border-[#c4c5d5] bg-white px-3 py-2 text-sm font-medium text-[#0b1c30] focus:border-[#15157d] focus:outline-none"
          >
            <option value="">All cohorts</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isActive ? ' (active)' : ''}</option>)}
          </select>
          <a
            href={`/coordinator/report${scopeYearId ? `?academicYearId=${scopeYearId}` : ''}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c4c5d5] px-4 py-2 text-sm font-semibold text-[#0b1c30] transition-colors hover:bg-[#e5eeff]"
          >
            <FileDown className="h-4 w-4" /> Export PDF
          </a>
          <Link to="/coordinator/placements" className="hidden rounded-lg border border-[#c4c5d5] px-4 py-2 text-sm font-semibold text-[#0b1c30] transition-colors hover:bg-[#e5eeff] sm:inline-block">
            Review placements
          </Link>
          <Link to="/coordinator/assignments" className="hidden rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:inline-block">
            Manage assignments
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((m) => {
          const Icon = m.icon;
          const interactive = 'onClick' in m || 'to' in m;
          const inner = (
            <>
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold tracking-wide text-[#757684]">{m.label}</span>
                <Icon className="h-5 w-5 text-[#15157d]" />
              </div>
              <div className="mt-4">
                <p className="text-4xl font-bold text-[#0b1c30]">{dashLoading ? '—' : m.value}</p>
                {'bar' in m ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
                    <div className="h-full rounded-full bg-[#15157d]" style={{ width: `${Math.min(100, Math.max(0, m.bar ?? 0))}%` }} />
                  </div>
                ) : (
                  <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${'tone' in m ? m.tone : 'text-[#757684]'}`}>
                    {m.label === 'Active Interns' && <TrendingUp className="h-4 w-4" />}{'sub' in m ? m.sub : null}
                  </p>
                )}
              </div>
            </>
          );
          const cls = `flex w-full flex-col justify-between rounded-xl border border-[#c4c5d5]/60 bg-white p-6 text-left ${interactive ? 'cursor-pointer transition-colors hover:border-[#15157d]/50 hover:bg-[#f8f9ff]' : ''}`;
          if ('to' in m && m.to) return <Link key={m.label} to={m.to} className={cls}>{inner}</Link>;
          if ('onClick' in m && m.onClick) return <button key={m.label} type="button" onClick={m.onClick} className={cls}>{inner}</button>;
          return <div key={m.label} className={cls}>{inner}</div>;
        })}
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* Left column */}
        <div className="col-span-12 space-y-4 lg:col-span-8">
          {/* Intern Status Monitor — sortable, filterable; "View all" → full list */}
          <InternStatusTable pageSize={8} viewAllHref="/coordinator/interns" scopeYearId={scopeYearId} />

          {/* Supervisor workload (item 14) */}
          <SupervisorWorkloadPanel scopeYearId={scopeYearId} />

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

            {/* AI matching — roadmap feature behind a flag (off in prod). When
                disabled, the panel and its Invite buttons are inert with a
                tooltip; no live-looking dead controls. */}
            <div className={`relative overflow-hidden rounded-xl bg-[#15157d] p-6 text-white ${aiMatchingEnabled ? '' : 'opacity-95'}`}>
              <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full bg-[#645efb] opacity-20 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#89ceff]" />
                    <h3 className="text-lg font-semibold">AI Pulse Matching</h3>
                  </div>
                  {!aiMatchingEnabled && <RoadmapBadge />}
                </div>
                <p className="mb-4 text-xs text-[#e1e0ff]">
                  {aiMatchingEnabled
                    ? 'Candidate–role matching ranked by fit.'
                    : 'Candidate–role matching is on the roadmap. The figures below are illustrative only.'}
                </p>
                <div className={`space-y-2 ${aiMatchingEnabled ? '' : 'select-none'}`}>
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
                      {/* Wrap the disabled button so the tooltip still shows (browsers
                          suppress title on disabled elements). */}
                      <span title={aiMatchingEnabled ? 'Invite candidate' : 'On the roadmap — not yet available'} className="inline-flex">
                        <button
                          disabled={!aiMatchingEnabled}
                          aria-disabled={!aiMatchingEnabled}
                          className={`rounded px-2 py-1 text-[10px] font-bold text-[#15157d] ${
                            aiMatchingEnabled ? 'cursor-pointer bg-white hover:bg-white/90' : 'cursor-not-allowed bg-white/60'
                          }`}
                        >
                          Invite
                        </button>
                      </span>
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

      {showDistribution && (
        <PerformanceDistributionModal scopeYearId={scopeYearId} onClose={() => setShowDistribution(false)} />
      )}
    </div>
  );
}

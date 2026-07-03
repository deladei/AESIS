import {
  Activity, ArrowRight, CheckCircle2, MessageCircle, Sparkles,
  AlertTriangle, CalendarClock, Zap, ArrowUpCircle, MoreVertical, ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAdminDashboard, type AdminDashboard as AdminData } from '@/hooks/useDashboard';
import AIEnrichmentPanel from '@/components/admin/AIEnrichmentPanel';

/**
 * Admin Dashboard — built from the Stitch "Supervisor Dashboard" design
 * (Pulse Check Board / AI Alerts / Recent Submissions).
 *
 * Live data via GET /api/v1/admin/dashboard. Chrome (sidebar + topbar) comes
 * from AdminShell. The "AI Alerts" panel has no backend feature yet, so it
 * renders Ghanaian demo content behind a "Sample" badge.
 */

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

type Pulse = AdminData['pulseBoard'][number];

function pulseBadge(p: Pulse, isTop: boolean): { label: string; tone: string } {
  if (isTop && p.riskTier !== 'high' && p.engagementPct >= 80) {
    return { label: 'Top Performer', tone: 'bg-[var(--h-6ffbbe)] text-[var(--h-002113)]' };
  }
  if (p.riskTier === 'high')   return { label: 'Needs Support', tone: 'bg-[var(--h-ffdad6)] text-[var(--h-93000a)]' };
  if (p.riskTier === 'medium') return { label: 'Watch',         tone: 'bg-amber-100 text-amber-800' };
  return { label: 'On Track', tone: 'bg-[var(--h-dce9ff)] text-[var(--h-464652)]' };
}

// Entry-pipeline statuses (the dashboard's recent rows are logbook entries).
const STATUS_TONE: Record<string, { label: string; tone: string }> = {
  submitted:    { label: 'Pending Review', tone: 'bg-amber-100 text-amber-800' },
  acknowledged: { label: 'Acknowledged',   tone: 'bg-emerald-100 text-emerald-800' },
  returned:     { label: 'Returned',       tone: 'bg-rose-100 text-rose-800' },
  draft:        { label: 'Draft',          tone: 'bg-slate-100 text-slate-700' },
};

export default function AdminDashboard() {
  const { data, isLoading, isError, refetch } = useAdminDashboard();

  const stats = [
    { label: 'Active Interns',  value: data ? String(data.overview.activeInterns)  : '—', tone: 'text-[var(--h-15157d)]' },
    { label: 'Pending Reviews', value: data ? String(data.overview.pendingReviews) : '—', tone: 'text-[var(--h-712ae2)]' },
    { label: 'Avg. Pulse',      value: data ? `${data.overview.avgEngagement}%`    : '—', tone: 'text-[var(--h-22c087)]' },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 p-6 md:p-10">
      {/* Welcome & stats */}
      <section className="flex flex-col items-end justify-between gap-6 md:flex-row">
        <div className="w-full">
          <h2 className="text-3xl font-semibold tracking-tight text-[var(--h-0b1c30)]">Admin Overview</h2>
          <p className="mt-1 text-[var(--h-464652)]">
            {data
              ? `Monitoring ${data.overview.activeInterns} active internship${data.overview.activeInterns === 1 ? '' : 's'} across all departments.`
              : 'Monitoring active internships across all departments.'}
          </p>
        </div>
        <div className="flex gap-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] p-4 shadow-sm">
              <span className="text-xs font-medium text-[var(--h-464652)]">{s.label}</span>
              <span className={`text-2xl font-bold ${s.tone}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {isError && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          <span>Couldn't load the dashboard.</span>
          <button onClick={() => refetch()} className="font-semibold underline">Try again</button>
        </div>
      )}

      {/* Bento grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Pulse Check Board */}
        <section className="col-span-12 space-y-4 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-2xl font-semibold text-[var(--h-0b1c30)]">
              <Activity className="h-6 w-6 text-[var(--h-22c087)]" />
              Pulse Check Board
            </h3>
            <Link to="/ai-insights" className="flex items-center gap-1 text-sm font-medium text-[var(--h-15157d)] hover:underline">
              View detailed metrics <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff-60)]" />
              ))}
            </div>
          ) : data && data.pulseBoard.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--h-c7c5d4-50)] bg-[var(--h-ffffff-60)] p-8 text-center text-sm text-[var(--h-464652)]">
              No active interns yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data?.pulseBoard.map((p, i) => {
                const badge = pulseBadge(p, i === 0);
                const isTop = badge.label === 'Top Performer';
                return (
                  <div key={p.placementId} className="rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff-70)] p-4 backdrop-blur transition-all hover:shadow-lg">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--h-e1e0ff)] text-sm font-bold text-[var(--h-15157d)]">{initials(p.name)}</div>
                        <div>
                          <h4 className="text-sm font-bold text-[var(--h-0b1c30)]">{p.name}</h4>
                          <p className="text-xs text-[var(--h-464652)]">{p.department ?? 'Unassigned department'}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badge.tone}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--h-464652)]">Weekly engagement</span>
                        <span className="font-semibold text-[var(--h-15157d)]">{p.engagementPct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full ${isTop ? 'bg-[var(--h-4edea3)]' : 'bg-[var(--h-15157d)]'}`} style={{ width: `${p.engagementPct}%` }} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--h-464652)]">
                        <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {p.submittedWeeks}/{p.totalWeeks} weeks</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {p.feedbackCount} feedback</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* AI Alerts — no backend feature yet; demo content behind a Sample badge */}
        <aside className="col-span-12 space-y-4 lg:col-span-4">
          <h3 className="flex items-center gap-2 text-2xl font-semibold text-[var(--h-0b1c30)]">
            <Sparkles className="h-6 w-6 text-[var(--h-712ae2)]" />
            AI Alerts
            <span className="rounded-full bg-[var(--h-ede9ff)] px-2 py-0.5 text-[10px] font-semibold text-[var(--h-712ae2)]">Sample</span>
          </h3>
          <div className="flex flex-col gap-4">
            {/* Urgent */}
            <div className="space-y-3 rounded-xl border border-[var(--h-712ae2-20)] bg-[var(--h-ffffff-70)] p-5 shadow-[0_0_15px_-3px_rgba(113,42,226,0.15)] backdrop-blur">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[var(--h-712ae2)]" />
                <span className="text-xs font-bold tracking-wide text-[var(--h-712ae2)]">Urgent support needed</span>
              </div>
              <p className="text-sm leading-tight text-[var(--h-0b1c30)]">
                <span className="font-bold text-[var(--h-15157d)]">Kwesi Boateng</span> has missed 3 daily standups and submission frequency has dropped by 45% this week.
              </p>
              <div className="rounded-lg border border-[var(--h-ba1a1a-10)] bg-[var(--h-ffdad6-30)] p-3">
                <p className="text-sm italic text-[var(--h-93000a)]">"AI predicts potential burnout or blockers in the 'Authentication' module."</p>
              </div>
              {/* Real destination — the Feedback Center chats + schedules calls */}
              <Link to="/feedback" className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--h-712ae2)] py-2 text-sm font-medium text-[var(--h-712ae2)] transition-colors hover:bg-[var(--h-712ae2-5)]">
                <CalendarClock className="h-4 w-4" /> Schedule check-in
              </Link>
            </div>
            {/* Growth */}
            <div className="space-y-3 rounded-xl border border-[var(--h-712ae2-20)] bg-[var(--h-ffffff-70)] p-5 shadow-[0_0_15px_-3px_rgba(113,42,226,0.15)] backdrop-blur">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-[var(--h-22c087)]" />
                <span className="text-xs font-bold tracking-wide text-[var(--h-22c087)]">Growth opportunity</span>
              </div>
              <p className="text-sm leading-tight text-[var(--h-0b1c30)]">
                <span className="font-bold text-[var(--h-15157d)]">Akua Sarpong</span> has completed her curriculum 2 weeks ahead of schedule.
              </p>
              <p className="text-sm text-[var(--h-464652)]">AI suggests assigning "Lead Architect Shadowing" to maintain momentum.</p>
              {/* Roadmap action — disabled with a tooltip, same treatment as the
                  coordinator's AI Pulse panel (no live-looking dead controls). */}
              <span title="On the roadmap — not yet available" className="block">
                <button
                  disabled
                  aria-disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[var(--h-712ae2)] py-2 text-sm font-medium text-[var(--h-712ae2)] opacity-50"
                >
                  <ArrowUpCircle className="h-4 w-4" /> Promote to level 2
                </button>
              </span>
            </div>
          </div>
        </aside>

        {/* AI enrichment pipeline health + manual revive */}
        <section className="col-span-12">
          <AIEnrichmentPanel />
        </section>

        {/* Recent Submissions */}
        <section className="col-span-12 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-semibold text-[var(--h-0b1c30)]">Recent Submissions</h3>
            <div className="flex gap-2">
              <span className="rounded-full bg-[var(--h-8a4cfc)] px-3 py-1 text-xs font-medium text-[var(--h-fffbff)]">
                {data?.submissionCounts.pending ?? 0} Pending
              </span>
              <span className="rounded-full bg-[var(--h-e5eeff)] px-3 py-1 text-xs font-medium text-[var(--h-464652)]">
                {data?.submissionCounts.reviewed ?? 0} Reviewed
              </span>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--h-c7c5d4-30)] bg-[var(--h-ffffff)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-[var(--h-c7c5d4-30)] bg-[var(--h-eff4ff)]">
                  <tr className="text-xs font-medium text-[var(--h-464652)]">
                    <th className="px-6 py-4">Intern</th>
                    <th className="px-6 py-4">Week</th>
                    <th className="px-6 py-4">Submission date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--h-c7c5d4-20)]">
                  {isLoading && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-[var(--h-464652)]">Loading submissions…</td></tr>
                  )}
                  {data && data.recentSubmissions.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-[var(--h-464652)]">No submissions yet.</td></tr>
                  )}
                  {data?.recentSubmissions.map((s) => {
                    const status = STATUS_TONE[s.status] ?? { label: s.status, tone: 'bg-slate-100 text-slate-700' };
                    const isPending = s.status === 'submitted';
                    return (
                      <tr key={s.id} className="transition-colors hover:bg-[var(--h-eff4ff)]">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-2e3192)] text-xs font-bold text-[var(--h-9da1ff)]">{initials(s.internName)}</div>
                            <span className="text-sm text-[var(--h-0b1c30)]">{s.internName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--h-0b1c30)]">Week {s.weekNumber}</td>
                        <td className="px-6 py-4 text-sm text-[var(--h-464652)]">{formatDate(s.submittedAt)}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isPending ? (
                            <Link to={`/admin/review?entryId=${s.id}`} className="inline-block rounded-lg bg-[var(--h-15157d)] px-4 py-1.5 text-sm font-semibold text-white transition-transform active:scale-95">
                              Review
                            </Link>
                          ) : (
                            <Link to={`/admin/review?entryId=${s.id}`} aria-label="View entry" className="inline-block text-[var(--h-464652)] transition-colors hover:text-[var(--h-15157d)]">
                              <MoreVertical className="h-5 w-5" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center bg-[var(--h-eff4ff-50)] p-4">
              <Link to="/admin/review" className="flex items-center gap-2 text-sm font-medium text-[var(--h-464652)] transition-colors hover:text-[var(--h-15157d)]">
                View all submissions <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

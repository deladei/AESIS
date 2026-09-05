import { Link, useSearchParams } from 'react-router-dom';
import {
  Users, Hourglass, Clock, ShieldCheck, Star, AlertTriangle, ArrowRight,
} from 'lucide-react';
import InternStatusTable from '@/components/coordinator/InternStatusTable';
import { useInternStats } from '@/hooks/useDashboard';
import { useOversight } from '@/hooks/useOversight';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { NoValue } from '@/components/ui/Bits';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';

/**
 * Admin interns list — the "Interns" destination from the admin sidebar.
 *
 * Reuses the same sortable/filterable Intern Status Monitor the coordinator
 * uses (admin is authorized on every `/coordinator/*` endpoint and renders
 * inside the AdminShell), with the cohort's headline counts above it and the
 * real at-risk signals below. Honours `?attention=1` to deep-link straight to
 * flagged interns.
 *
 * The reference design's "Saved views", "Pause all" and auto-reminder switches
 * are absent: none of those exist behind the UI, and a toggle that controls
 * nothing is worse than no toggle. The AI insight strip at the foot is fed by
 * the real risk snapshots, so every number on this page is countable.
 */
export default function AdminInterns() {
  const [params] = useSearchParams();
  const attentionOnly = params.get('attention') === '1';

  const statsQuery     = useInternStats();
  const oversightQuery = useOversight();
  const stats = statsQuery.data;

  const share = (n: number | undefined) =>
    stats?.total && n != null ? `${Math.round((n / stats.total) * 100)}% of total` : undefined;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <header>
        <p className="mb-1 text-xs font-semibold text-brand-ink">Admin</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {attentionOnly ? 'Interns needing attention' : 'All Interns'}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Sort, filter, and drill into every active placement.
        </p>
      </header>

      {/* ── Headline counts ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Total interns" value={stats?.total ?? 0} icon={Users} tone="brand"
          loading={statsQuery.isLoading} footnote="Current placements"
        />
        <StatCard
          label="Not started" value={stats?.notStarted ?? 0} icon={Hourglass} tone="neutral"
          loading={statsQuery.isLoading} footnote={share(stats?.notStarted) ?? 'No week submitted yet'}
        />
        <StatCard
          label="In progress" value={stats?.inProgress ?? 0} icon={Clock} tone="warn"
          loading={statsQuery.isLoading} footnote={share(stats?.inProgress) ?? 'Logging weeks now'}
        />
        <StatCard
          label="Completed" value={stats?.completed ?? 0} icon={ShieldCheck} tone="ok"
          loading={statsQuery.isLoading} footnote={share(stats?.completed) ?? 'Finished or finalized'}
        />
        <StatCard
          label="Average score"
          value={stats?.avgScore != null
            ? `${stats.avgScore}/100`
            : <NoValue title="Nothing has been scored yet" />}
          icon={Star} tone="info" loading={statsQuery.isLoading}
          footnote="Mean logbook quality, advisory"
        />
        <StatCard
          label="At risk" value={stats?.atRisk ?? 0} icon={AlertTriangle} tone="danger"
          loading={statsQuery.isLoading}
          footnote={stats?.atRisk ? 'Needs attention' : 'Nobody flagged'}
          action={stats?.atRisk ? { label: 'View at-risk list', to: '/admin/interns?attention=1' } : undefined}
        />
      </div>

      {/* ── The monitor ──────────────────────────────────────── */}
      <InternStatusTable pageSize={20} initialFilters={attentionOnly ? { attention: true } : undefined} />

      {/* ── Risk signals ─────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Where attention is needed"
          subtitle="From the latest risk snapshots — every row here is a real signal, not a forecast"
          action={{ label: 'Open oversight', to: '/coordinator/interns?view=oversight' }}
        />
        {oversightQuery.isLoading ? (
          <SkeletonRows rows={3} />
        ) : !oversightQuery.data?.rows.some(r => r.atRisk) ? (
          <EmptyState
            icon={ShieldCheck}
            title="No interns are flagged"
            hint="Overdue logs, stalled progress, missing supervisors and below-threshold scores all appear here."
            className="py-8"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {oversightQuery.data.rows.filter(r => r.atRisk).slice(0, 4).map((r) => {
              const reasons = [
                r.flags.overdueLogs > 0 && `${r.flags.overdueLogs} overdue log${r.flags.overdueLogs === 1 ? '' : 's'}`,
                r.flags.lowAvgScore && 'Below-threshold score',
                r.flags.noSupervisorFeedback && 'No supervisor feedback',
              ].filter(Boolean) as string[];

              return (
                <li key={r.placementId}>
                  <Link
                    to={`/coordinator/interns/${r.placementId}`}
                    className="flex h-full flex-col rounded-lg border border-line p-3 transition-colors hover:border-brand"
                  >
                    <span className="flex items-start gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {r.student.firstName} {r.student.lastName}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">
                          {r.department ?? 'No department'}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-ink-secondary">
                      {reasons.length ? reasons.join(' · ') : 'Flagged by the latest risk snapshot'}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-ink">
                      View intern <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

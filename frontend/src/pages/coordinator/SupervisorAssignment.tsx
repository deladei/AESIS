import { useEffect, useState } from 'react';
import {
  Loader2, UserCheck, Check, GraduationCap, MapPin, Search, Users,
  UploadCloud, FileSpreadsheet, Scale, ChevronLeft, ChevronRight, AlertTriangle,
} from 'lucide-react';
import {
  useAllPlacements,
  useSupervisors,
  useAssignSupervisor,
  useSetSupervisorRegion,
  useUnassignedPlacements,
  usePlacementStats,
  type Placement,
  type Supervisor,
  type UnassignedPlacement,
} from '@/hooks/usePlacements';
import { useSupervisorWorkload } from '@/hooks/useDashboard';
import SupervisorPicker from '@/components/shared/SupervisorPicker';
import SupervisorUploadPanel from '@/components/coordinator/SupervisorUploadPanel';
import StudentRosterPanel from '@/components/coordinator/StudentRosterPanel';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { InitialsAvatar, ProgressBar, NoValue } from '@/components/ui/Bits';
import { DonutStat } from '@/components/ui/Charts';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';
import { REGION_VALUES, REGION_LABELS, regionLabel } from '@/lib/regions';
import { cn } from '@/lib/utils';

type StatusFilter = 'active' | 'pending' | 'all';

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'ok', pending: 'warn', completed: 'done', cancelled: 'danger',
  withdrawn: 'neutral', failed: 'danger', transferred_out: 'info',
};

function statusLabel(p: Placement) {
  if (p.isRejected) return 'Rejected';
  return p.placementStatus.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

/**
 * Supervisor Assignments — the four steps that get every intern a supervisor:
 * load the supervisor roster, load the intern roster, set who covers which
 * region, then assign or reassign anybody the auto-balancer could not place.
 *
 * The right rail is the state of that work, counted off live placements. The
 * design's per-row AI match score is absent — assignment here is by region and
 * workload, which is a rule, not a prediction, and dressing it up as a match
 * percentage would misrepresent how an intern actually got their supervisor.
 */
export default function SupervisorAssignment() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [query, setQuery]   = useState('');
  const [page, setPage]     = useState(1);

  // Debounce the student search so we don't hit the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const listQuery = useAllPlacements(
    page,
    filter === 'all' ? undefined : filter,
    query || undefined,
  );
  const placements = listQuery.data?.placements ?? [];

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <header>
            <p className="mb-1 text-xs font-semibold text-brand-ink">Coordinator</p>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Supervisor Assignments</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Assign supervisors to regions and manage intern placements.
            </p>
          </header>

          <div className="grid gap-5 lg:grid-cols-2">
            <Step n={1} icon={UploadCloud} title="Upload supervisor roster"
              hint="Add academic supervisors in bulk from a spreadsheet.">
              <SupervisorUploadPanel />
            </Step>
            <Step n={2} icon={FileSpreadsheet} title="Upload intern roster"
              hint="Load intern data so placements can be matched and assigned.">
              <StudentRosterPanel />
            </Step>
          </div>

          <Step n={3} icon={MapPin} title="Supervisor regions"
            hint="Each supervisor covers one region. New interns registering there are auto-assigned to the least-loaded supervisor covering it.">
            <SupervisorRegionsPanel />
          </Step>

          <NeedsSupervisorPanel />

          <Step n={4} icon={Users} title="Placements"
            hint="Reassign the academic supervisor on any placement. Their dashboard populates as soon as they are assigned.">
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="relative min-w-[240px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search placements"
                    placeholder="Search interns, index numbers or companies…"
                    className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                  />
                </label>

                <div className="flex gap-1 rounded-lg border border-line p-1">
                  {(['active', 'pending', 'all'] as StatusFilter[]).map(f => (
                    <button
                      key={f} type="button"
                      onClick={() => { setFilter(f); setPage(1); }}
                      aria-pressed={filter === f}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition-colors',
                        filter === f ? 'bg-brand text-ink-inverse' : 'text-ink-muted hover:text-ink',
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {listQuery.isLoading ? (
                <SkeletonRows rows={4} />
              ) : placements.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  title={query ? `No placements match “${query}”` : 'No placements here yet'}
                  hint={query ? 'Try a different name, index number or company.' : undefined}
                />
              ) : (
                <div className="space-y-3">
                  {placements.map(p => <AssignmentRow key={p.id} placement={p} />)}
                </div>
              )}

              {(page > 1 || placements.length >= 20) && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-muted">
                    Showing {placements.length} placement{placements.length === 1 ? '' : 's'} on page {page}
                  </p>
                  <div className="flex items-center gap-1">
                    <PageButton disabled={page === 1} onClick={() => setPage(p => p - 1)} label="Previous page">
                      <ChevronLeft className="h-4 w-4" />
                    </PageButton>
                    <span className="px-2 text-sm font-semibold text-ink">{page}</span>
                    <PageButton disabled={placements.length < 20} onClick={() => setPage(p => p + 1)} label="Next page">
                      <ChevronRight className="h-4 w-4" />
                    </PageButton>
                  </div>
                </div>
              )}
            </div>
          </Step>
        </div>

        <aside className="space-y-5">
          <AssignmentOverview />
          <WorkloadBalance />
        </aside>
      </div>
    </div>
  );
}

/* ── Layout bits ─────────────────────────────────────────────── */

function Step({
  n, icon: Icon, title, hint, children,
}: {
  n: number; icon: React.ElementType; title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{n}. {title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{hint}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function PageButton({
  disabled, onClick, label, children,
}: { disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-secondary transition-colors hover:bg-surface-sunken disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ── Right rail ──────────────────────────────────────────────── */

/**
 * Where the assignment work stands. Counted over LIVE placements only: a
 * completed placement no longer needs a supervisor, so including it would
 * inflate "assigned" and make the queue look shorter than it is.
 */
function AssignmentOverview() {
  const workloadQuery = useSupervisorWorkload();
  const statsQuery    = usePlacementStats();

  const summary = workloadQuery.data?.summary;
  const stats   = statsQuery.data;

  const assigned   = summary?.assignedTotal ?? 0;
  const unassigned = summary?.unassigned ?? 0;
  const totalLive  = assigned + unassigned;

  return (
    <Card>
      <CardHeader title="Assignment overview" subtitle="Active placements" />
      {workloadQuery.isLoading ? (
        <SkeletonRows rows={2} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure value={totalLive}  label="Active interns" />
            <Figure value={assigned}   label="Assigned" tone="ok" />
            <Figure value={unassigned} label="Unassigned" tone={unassigned > 0 ? 'warn' : undefined} />
          </div>

          {totalLive > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-ink-muted">Assigned</span>
                <span className="font-semibold text-ink">
                  {Math.round((assigned / totalLive) * 100)}%
                </span>
              </div>
              <ProgressBar value={(assigned / totalLive) * 100} tone="ok" label="Share of active placements assigned" />
            </div>
          )}

          <div className="mt-4 border-t border-line pt-4">
            <DonutStat
              data={[
                { label: 'Approved', value: stats?.approved ?? 0, color: 'var(--chart-1)' },
                { label: 'Awaiting approval', value: stats?.pending ?? 0, color: 'var(--chart-2)' },
                { label: 'Rejected', value: stats?.rejected ?? 0, color: 'var(--chart-4)' },
              ].filter(s => s.value > 0)}
              centerValue={stats?.placementRate != null
                ? `${stats.placementRate}%`
                : <NoValue title="Nothing has been decided yet" />}
              centerCaption="Placement rate"
              emptyHint="Placements appear here as they are submitted and decided."
            />
          </div>
        </>
      )}
    </Card>
  );
}

function Figure({
  value, label, tone,
}: { value: number; label: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-lg bg-surface-sunken px-2 py-3">
      <p className={cn(
        'text-xl font-bold',
        tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink',
      )}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * Whether the load is actually spread evenly. This is a measurement — the
 * spread between the busiest and the quietest supervisor — not an AI opinion.
 */
function WorkloadBalance() {
  const { data, isLoading } = useSupervisorWorkload();
  const summary = data?.summary;
  const rows    = data?.rows ?? [];

  return (
    <Card>
      <CardHeader title="Workload balance" subtitle="Interns per supervisor, live placements" />
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No supervisors yet"
          hint="Upload the supervisor roster to start assigning interns."
          className="py-6"
        />
      ) : (
        <>
          {summary?.imbalanced && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                The busiest supervisor carries {summary.spread} more interns than the quietest
                ({summary.max} vs {summary.min}). Reassigning evens that out.
              </span>
            </p>
          )}

          <ul className="space-y-2.5">
            {rows.slice(0, 6).map(r => (
              <li key={r.supervisor.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-ink">{r.supervisor.name}</span>
                  <span className={cn('shrink-0 font-semibold', r.overloaded ? 'text-warn' : 'text-ink-secondary')}>
                    {r.internCount}
                  </span>
                </div>
                <ProgressBar
                  value={summary?.max ? (r.internCount / summary.max) * 100 : 0}
                  tone={r.overloaded ? 'warn' : 'brand'}
                  label={`${r.supervisor.name}: ${r.internCount} interns`}
                />
              </li>
            ))}
          </ul>

          {summary && (
            <p className="mt-3 text-[11px] text-ink-muted">
              Average {summary.mean} interns per supervising member of staff.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/* ── Assignment row ──────────────────────────────────────────── */

function AssignmentRow({ placement }: { placement: Placement }) {
  const { data: supervisors = [] } = useSupervisors();
  const assign = useAssignSupervisor();

  const currentId = placement.academicSupervisor?.id ?? '';
  const [choice, setChoice]   = useState<string>(currentId);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const studentName = placement.student
    ? `${placement.student.firstName} ${placement.student.lastName}`
    : placement.studentId;
  const currentName = placement.academicSupervisor
    ? `${placement.academicSupervisor.firstName} ${placement.academicSupervisor.lastName}`
    : null;

  const dirty = choice !== currentId && choice !== '';

  const save = async () => {
    if (!dirty) return;
    await assign.mutateAsync({ id: placement.id, supervisorId: choice });
    setSavedAt(Date.now());
  };

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface px-4 py-3.5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <InitialsAvatar name={studentName} size={36} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-ink">{studentName}</span>
            <Badge tone={placement.isRejected ? 'danger' : STATUS_TONE[placement.placementStatus] ?? 'neutral'}>
              {statusLabel(placement)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted">
            {placement.company?.name ?? 'No company'}
            {placement.role ? ` · ${placement.role}` : ''}
            {' · '}
            {currentName
              ? <span className="text-ink-secondary">{currentName}</span>
              : <span className="text-warn">Unassigned</span>}
            {placement.region ? ` · ${regionLabel(placement.region)}` : ''}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SupervisorPicker
          supervisors={supervisors}
          value={choice}
          onChange={(id) => { setChoice(id); setSavedAt(null); }}
          placeholder="Select supervisor…"
          className="min-w-[13rem]"
        />

        {savedAt ? (
          <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-ok">
            <Check className="h-4 w-4" /> Saved
          </span>
        ) : (
          <button
            type="button" onClick={save} disabled={!dirty || assign.isPending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            {currentName ? 'Reassign' : 'Assign'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Regions ─────────────────────────────────────────────────── */

function SupervisorRegionRow({ supervisor }: { supervisor: Supervisor }) {
  const setRegion = useSetSupervisorRegion();
  const current = supervisor.region ?? '';

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <InitialsAvatar name={`${supervisor.firstName} ${supervisor.lastName}`} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {supervisor.firstName} {supervisor.lastName}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {supervisor.load ?? 0} active {(supervisor.load ?? 0) === 1 ? 'intern' : 'interns'}
            {supervisor.region
              ? <> · {regionLabel(supervisor.region)}</>
              : <span className="text-warn"> · No region</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={current}
          onChange={(e) => setRegion.mutate({ id: supervisor.id, region: e.target.value || null })}
          disabled={setRegion.isPending}
          aria-label={`Region for ${supervisor.firstName} ${supervisor.lastName}`}
          className="min-w-[12rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none disabled:opacity-50"
        >
          <option value="">No region</option>
          {REGION_VALUES.map(r => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
        </select>
        {setRegion.isPending && <Loader2 className="h-4 w-4 animate-spin text-brand" />}
      </div>
    </div>
  );
}

function SupervisorRegionsPanel() {
  const { data: supervisors = [], isLoading } = useSupervisors();

  return (
    <div className="mt-4">
      {isLoading ? (
        <SkeletonRows rows={3} />
      ) : supervisors.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No academic supervisors registered yet"
          hint="Upload the supervisor roster above and they will appear here."
        />
      ) : (
        <div className="space-y-3">
          {supervisors.map(s => <SupervisorRegionRow key={s.id} supervisor={s} />)}
        </div>
      )}
    </div>
  );
}

/* ── Needs a supervisor ──────────────────────────────────────── */

function UnassignedRow({ placement }: { placement: UnassignedPlacement }) {
  const { data: supervisors = [] } = useSupervisors();
  const assign = useAssignSupervisor();
  const [choice, setChoice] = useState('');

  return (
    <div className="flex flex-col gap-4 rounded-card border border-warn/30 bg-warn-soft/40 px-4 py-3.5 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{placement.student.name}</p>
        <p className="truncate text-xs text-ink-muted">
          {placement.company ?? 'No company'} · {regionLabel(placement.region)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SupervisorPicker
          supervisors={supervisors} value={choice} onChange={setChoice}
          placeholder="Select supervisor…" className="min-w-[13rem]"
        />
        <button
          type="button"
          onClick={() => choice && assign.mutate({ id: placement.id, supervisorId: choice })}
          disabled={!choice || assign.isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
          Assign
        </button>
      </div>
    </div>
  );
}

function NeedsSupervisorPanel() {
  const { data: unassigned = [], isLoading } = useUnassignedPlacements();
  if (isLoading || unassigned.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2">
          Needs a supervisor
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">{unassigned.length}</span>
        </span>}
        subtitle="These interns registered in a region with no supervisor configured. Assign one directly, or set a region above so future interns auto-assign."
      />
      <div className="space-y-3">
        {unassigned.map(p => <UnassignedRow key={p.id} placement={p} />)}
      </div>
    </Card>
  );
}

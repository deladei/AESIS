import { useMemo, useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp, ChevronRight,
  ChevronLeft, Search, Users, ClipboardCheck, TrendingUp, Briefcase,
} from 'lucide-react';
import {
  useAllPlacements, useUpdatePlacementStatus, useSupervisors, usePlacementStats,
  type Placement, type Supervisor,
} from '@/hooks/usePlacements';
import SupervisorPicker from '@/components/shared/SupervisorPicker';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { InitialsAvatar, NoValue } from '@/components/ui/Bits';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';
import { freeText } from '@/lib/validation';
import { FieldError } from '@/components/shared/FieldError';

type Tab = 'pending' | 'reviewed' | 'all';

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'ok', completed: 'done', pending: 'warn',
  cancelled: 'danger', withdrawn: 'neutral', failed: 'danger',
  transferred_out: 'info',
};

function statusLabel(p: Placement) {
  if (p.isRejected) return 'Rejected';
  return p.placementStatus.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Placement Approval — the coordinator's decision queue and the record of every
 * decision already taken.
 *
 * Pending placements keep the full review card (supervisor picker, approve, and
 * a rejection that requires a written reason — the student is told why). The
 * reviewed and all-placements tabs are the board: who decided, when, and what
 * the outcome was. The design's per-row match score and "AI Placement Match
 * Quality" donut are absent — nothing in this system models how well an intern
 * fits a role, and a made-up percentage on an approval screen is the last place
 * anyone should have to second-guess.
 */
export default function PlacementApproval() {
  const [tab, setTab]       = useState<Tab>('pending');
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('all');
  const [dept, setDept]     = useState('all');

  const statusFilter = tab === 'pending' ? 'pending' : undefined;
  const listQuery    = useAllPlacements(page, statusFilter, search);
  const statsQuery   = usePlacementStats();
  const { data: supervisors = [] } = useSupervisors();

  const stats = statsQuery.data;
  const rows  = listQuery.data?.placements ?? [];

  // "Reviewed" is every placement that has left the queue — approved, rejected
  // or closed. The tab filters client-side because the endpoint takes a single
  // status and this is one page of rows.
  const visible = useMemo(() => {
    const byTab = tab === 'reviewed'
      ? rows.filter(p => p.placementStatus !== 'pending')
      : rows;
    return byTab.filter((p) => {
      if (company !== 'all' && p.company?.name !== company) return false;
      if (dept !== 'all' && p.department !== dept) return false;
      return true;
    });
  }, [rows, tab, company, dept]);

  const companies = useMemo(
    () => [...new Set(rows.map(p => p.company?.name).filter((n): n is string => !!n))].sort(),
    [rows],
  );
  const departments = useMemo(
    () => [...new Set(rows.map(p => p.department).filter((d): d is string => !!d))].sort(),
    [rows],
  );

  const switchTab = (next: Tab) => { setTab(next); setPage(1); };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <header>
        <p className="mb-1 text-xs font-semibold text-brand-ink">Coordinator</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Placement Approval</h1>
        <p className="mt-1 text-sm text-ink-secondary">Review and approve student placements.</p>
      </header>

      {/* ── Headline figures ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Pending review" value={stats?.pending ?? 0} icon={Clock} tone="warn"
          loading={statsQuery.isLoading}
          footnote={stats?.pending ? 'Require your attention' : 'Queue is clear'}
        />
        <StatCard
          label="Approved" value={stats?.approved ?? 0} icon={CheckCircle2} tone="ok"
          loading={statsQuery.isLoading} footnote="Active and completed placements"
        />
        <StatCard
          label="Rejected" value={stats?.rejected ?? 0} icon={XCircle} tone="danger"
          loading={statsQuery.isLoading} footnote="Refused with a written reason"
        />
        <StatCard
          label="Total placements" value={stats?.total ?? 0} icon={Users} tone="brand"
          loading={statsQuery.isLoading} footnote="Every placement on record"
        />
        <StatCard
          label="Placement rate"
          value={stats?.placementRate != null
            ? `${stats.placementRate}%`
            : <NoValue title="Nothing has been decided yet" />}
          icon={TrendingUp} tone="info" loading={statsQuery.isLoading}
          footnote="Share of decided placements approved"
        />
      </div>

      {/* ── Pipeline ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Placement pipeline"
          subtitle="Applications feed placements; each stage is a count of real rows"
        />
        {statsQuery.isLoading ? (
          <SkeletonRows rows={1} />
        ) : (
          <ol className="flex flex-wrap items-stretch gap-2">
            {stats?.pipeline.map((stage, i) => (
              <li key={stage.key} className="flex flex-1 items-center gap-2">
                <div className="min-w-[8rem] flex-1 rounded-lg bg-surface-sunken px-4 py-3 text-center">
                  <p className="text-xl font-bold text-ink">{stage.count}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-ink-muted">{stage.label}</p>
                </div>
                {i < stats.pipeline.length - 1 && (
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-ink-muted sm:block" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line">
        <TabButton active={tab === 'pending'} onClick={() => switchTab('pending')}
          label="Pending review" count={stats?.pending} />
        <TabButton active={tab === 'reviewed'} onClick={() => switchTab('reviewed')} label="Reviewed" />
        <TabButton active={tab === 'all'} onClick={() => switchTab('all')} label="All placements" />
      </div>

      {/* ── Filters ──────────────────────────────────────────── */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by intern name, index number or company…"
            aria-label="Search placements"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
          />
        </label>

        {companies.length > 1 && (
          <select
            value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-secondary focus:border-brand focus:outline-none"
          >
            <option value="all">Company: All</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {departments.length > 1 && (
          <select
            value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-secondary focus:border-brand focus:outline-none"
          >
            <option value="all">Department: All</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </Card>

      {/* ── The queue / the board ────────────────────────────── */}
      {listQuery.isLoading ? (
        <SkeletonRows rows={5} />
      ) : listQuery.isError ? (
        <Card><ErrorState onRetry={() => void listQuery.refetch()} /></Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'pending' ? ClipboardCheck : Briefcase}
            title={tab === 'pending' ? 'No pending placements to review' : 'Nothing to show here'}
            hint={tab === 'pending'
              ? 'Every placement has been reviewed. New submissions land here.'
              : 'Adjust the search or filters to see more placements.'}
          />
        </Card>
      ) : tab === 'pending' ? (
        <div className="space-y-3">
          {visible.map(p => (
            <ReviewCard key={p.id} placement={p} supervisors={supervisors} />
          ))}
        </div>
      ) : (
        <PlacementTable rows={visible} />
      )}

      {/* ── Pagination ───────────────────────────────────────── */}
      {(page > 1 || rows.length >= 20) && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            Showing {visible.length} placement{visible.length === 1 ? '' : 's'} on page {page}
          </p>
          <div className="flex items-center gap-1">
            <PageButton disabled={page === 1} onClick={() => setPage(p => p - 1)} label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </PageButton>
            <span className="px-2 text-sm font-semibold text-ink">{page}</span>
            <PageButton disabled={rows.length < 20} onClick={() => setPage(p => p + 1)} label="Next page">
              <ChevronRight className="h-4 w-4" />
            </PageButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */

function TabButton({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
        active ? 'border-brand text-brand-ink' : 'border-transparent text-ink-muted hover:text-ink',
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span className="ml-2 rounded-full bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">
          {count}
        </span>
      )}
    </button>
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

function PlacementTable({ rows }: { rows: Placement[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-sunken text-left text-xs font-semibold text-ink-secondary">
              <th scope="col" className="px-4 py-3">Intern</th>
              <th scope="col" className="px-4 py-3">Company</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3">Department</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Reviewed by</th>
              <th scope="col" className="px-4 py-3">Decided</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const name = p.student ? `${p.student.firstName} ${p.student.lastName}` : p.studentId;
              const decided = formatDate(p.approvedAt) ?? formatDate(p.updatedAt);
              return (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-surface-sunken/60">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <InitialsAvatar name={name} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{name}</span>
                        {p.student?.indexNumber && (
                          <span className="block truncate text-xs text-ink-muted">{p.student.indexNumber}</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{p.company?.name ?? <NoValue />}</td>
                  <td className="px-4 py-3 text-ink-secondary">{p.role ?? <NoValue title="Placement was not created from a posted role" />}</td>
                  <td className="px-4 py-3 text-ink-secondary">{p.department ?? <NoValue />}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.isRejected ? 'danger' : STATUS_TONE[p.placementStatus] ?? 'neutral'}>
                      {statusLabel(p)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{p.reviewedBy ?? <NoValue title="No reviewer recorded" />}</td>
                  <td className="px-4 py-3 text-ink-secondary">{decided ?? <NoValue />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * The rule `updatePlacementStatusSchema` parses a rejection reason with. The
 * button used to unlock on ANY non-empty text, so a three-word refusal was
 * accepted by the form and thrown out by the API as a bare 400.
 */
const rejectionReasonRule = freeText(1000, 'Reason')
  .min(10, 'Give the student at least a sentence — 10 characters or more');

/** The pending-placement decision card — approve, or reject with a reason. */
function ReviewCard({
  placement: p, supervisors,
}: { placement: Placement; supervisors: Supervisor[] }) {
  const updateStatus = useUpdatePlacementStatus();
  const [open, setOpen]         = useState(false);
  const [reason, setReason]     = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [done, setDone]         = useState<'approved' | 'rejected' | null>(null);
  const [supervisorId, setSupervisorId] = useState('');
  const [error, setError]       = useState<string | null>(null);

  const reasonCheck = reason.trim() === '' ? null : rejectionReasonRule.safeParse(reason);
  const reasonError = reasonCheck && !reasonCheck.success
    ? reasonCheck.error.issues[0]?.message
    : undefined;

  const name = p.student ? `${p.student.firstName} ${p.student.lastName}` : p.studentId;

  async function decide(status: 'active' | 'rejected') {
    setError(null);
    try {
      await updateStatus.mutateAsync(
        status === 'active'
          ? { id: p.id, status, supervisorId: supervisorId || undefined }
          : { id: p.id, status, rejectionReason: reason.trim() },
      );
      setDone(status === 'active' ? 'approved' : 'rejected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that decision.');
    }
  }

  return (
    <Card padded={false} className={cn('overflow-hidden', done && 'border-ok')}>
      <button
        type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-sunken/60"
      >
        <InitialsAvatar name={name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {p.company?.name ?? 'No company'}
            {p.role ? ` · ${p.role}` : ''}
            {formatDate(p.createdAt) ? ` · Submitted ${formatDate(p.createdAt)}` : ''}
          </span>
        </span>
        {done
          ? <Badge tone={done === 'approved' ? 'ok' : 'danger'} icon={done === 'approved' ? CheckCircle2 : XCircle}>
              {done === 'approved' ? 'Approved' : 'Rejected'}
            </Badge>
          : <Badge tone="warn" icon={Clock}>Pending</Badge>}
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-muted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />}
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-5">
          <dl className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Company"       value={p.company?.name} />
            <Detail label="Student email" value={p.student?.email} />
            <Detail label="Start date"    value={formatDate(p.startDate)} />
            <Detail label="End date"      value={formatDate(p.endDate)} />
          </dl>

          {!done && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-secondary">
                  Academic supervisor{' '}
                  <span className="font-normal text-ink-muted">(optional — the least-loaded regional supervisor is assigned otherwise)</span>
                </label>
                <SupervisorPicker
                  supervisors={supervisors}
                  value={supervisorId}
                  onChange={setSupervisorId}
                  placeholder="No supervisor yet"
                  emptyLabel="No supervisor yet"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button" onClick={() => decide('active')} disabled={updateStatus.isPending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ok px-4 py-2.5 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve placement
                </button>
                <button
                  type="button" onClick={() => setRejecting(r => !r)} disabled={updateStatus.isPending}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft/70 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </div>

              {rejecting && (
                <div className="space-y-2">
                  <textarea
                    rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                    aria-label="Reason for rejection" aria-invalid={!!reasonError}
                    placeholder="Why is this placement being refused? The student is told, so write it for them…"
                    className="w-full resize-none rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:border-danger focus:outline-none"
                  />
                  <FieldError message={reasonError} />
                  <button
                    type="button" onClick={() => decide('rejected')}
                    disabled={reasonCheck?.success !== true || updateStatus.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {updateStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirm rejection
                  </button>
                </div>
              )}

              {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="mb-0.5 text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{value ?? <NoValue />}</dd>
    </div>
  );
}

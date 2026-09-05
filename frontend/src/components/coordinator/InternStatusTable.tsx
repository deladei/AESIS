import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Filter, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X, BellRing, UserCheck, Download, Flag, AlertTriangle,
} from 'lucide-react';
import {
  useCoordinatorStudents, useCoordinatorProgrammes, useCoordinatorCohorts,
  useBulkRemind, useBulkAssign, downloadInternsCsv,
  type StudentSortKey, type StudentStatusFilter, type CoordinatorStudent,
} from '@/hooks/useDashboard';
import { useSupervisors } from '@/hooks/usePlacements';
import RowActionsMenu from './RowActionsMenu';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted:    { label: 'Submitted',    cls: 'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)]' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]' },
  returned:     { label: 'Returned',     cls: 'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)]' },
  draft:        { label: 'Draft',        cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]' },
  not_started:  { label: 'Not started',  cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]' },
};

const RISK_CLS: Record<string, string> = {
  low:    'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
};

interface Filters {
  status?:         StudentStatusFilter;
  programmeId?:    string;
  supervisorId?:   string;
  academicYearId?: string;
  riskTier?:       'low' | 'medium' | 'high';
  attention?:      boolean;
}

const ATTENTION_LABELS: { key: keyof CoordinatorStudent['attentionReasons']; label: string }[] = [
  { key: 'overdueLog',   label: 'Overdue log' },
  { key: 'zeroProgress', label: 'No logbook progress' },
  { key: 'noSupervisor', label: 'No supervisor' },
  { key: 'lowScore',     label: 'Below-threshold score' },
];

function attentionReasonText(r: CoordinatorStudent['attentionReasons']): string {
  return ATTENTION_LABELS.filter(({ key }) => r[key]).map(({ label }) => label).join(' · ');
}

// How often the table re-fetches while the Live toggle is on.
const LIVE_POLL_MS = 15_000;

interface Props {
  pageSize?: number;
  /** Compact dashboard mode: show a "View all" link to this href instead of pager. */
  viewAllHref?: string;
  /** Lock the table to one cohort (item 17 — driven by the dashboard cohort
   *  selector). When set, the in-panel cohort filter is hidden. */
  scopeYearId?: string;
  /** Seed the filter panel (e.g. the dashboard "Needs attention" card deep-links
   *  here with attention pre-applied). */
  initialFilters?: Filters;
}

function SortHeader({
  label, col, sortBy, sortDir, onSort, className = '',
}: {
  label: string; col: StudentSortKey; sortBy?: StudentSortKey; sortDir: 'asc' | 'desc';
  onSort: (c: StudentSortKey) => void; className?: string;
}) {
  const active = sortBy === col;
  return (
    <th className={`px-4 py-3 ${className}`}>
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 font-semibold tracking-wide transition-colors hover:text-[var(--h-15157d)] ${active ? 'text-[var(--h-15157d)]' : 'text-[var(--h-757684)]'}`}
      >
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function InternRow({ s, selected, onToggle }: { s: CoordinatorStudent; selected: boolean; onToggle: (id: string) => void }) {
  const name = `${s.student.firstName} ${s.student.lastName}`;
  const status = STATUS_META[s.lastStatus ?? 'not_started'] ?? STATUS_META.not_started;
  const lastEntry = s.lastSubmittedAt
    ? new Date(s.lastSubmittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—';
  return (
    <tr className={`transition-colors hover:bg-[var(--h-eff4ff)] ${selected ? 'bg-[var(--h-eff4ff)]' : ''}`}>
      <td className="px-4 py-3">
        <input type="checkbox" checked={selected} onChange={() => onToggle(s.placementId)} aria-label={`Select ${name}`}
          className="h-4 w-4 cursor-pointer rounded border-[var(--h-c4c5d5)] text-[var(--h-15157d)] focus:ring-[var(--h-15157d)]" />
      </td>
      <td className="px-6 py-3">
        <Link to={`/coordinator/interns/${s.placementId}`} className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--h-e1e0ff)] text-[11px] font-bold text-[var(--h-15157d)]">{initials(name)}</div>
          <div>
            <p className="flex items-center gap-1 text-sm font-bold leading-tight text-[var(--h-0b1c30)]">
              {name}
              {s.flagged && <Flag className="h-3 w-3 fill-amber-400 text-amber-500" />}
            </p>
            <p className="font-mono text-xs text-[var(--h-757684)]">#{s.placementId.slice(0, 6).toUpperCase()}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--h-0b1c30)]">{s.department ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-[var(--h-0b1c30)]">
        {s.supervisor?.name?.trim() ? s.supervisor.name : <span className="text-[var(--h-757684)]">Unassigned</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
      </td>
      <td className="px-4 py-3">
        {s.attention ? (
          <span
            title={`Needs attention — ${attentionReasonText(s.attentionReasons)}`}
            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"
          >
            <AlertTriangle className="h-3 w-3" /> At risk
          </span>
        ) : (
          <span className="text-sm text-[var(--h-bdbfca)]">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {s.riskTier ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${RISK_CLS[s.riskTier]}`}>
            {s.riskTier}{s.riskScore != null && ` · ${s.riskScore.toFixed(2)}`}
          </span>
        ) : <span className="text-sm text-[var(--h-757684)]">—</span>}
      </td>
      <td className="px-4 py-3">
        {/* Progress is against the weeks DUE so far, not the whole programme —
            a 24-week cohort in its third week is not 12% behind. Null means
            nothing is due yet, which renders "—", never 0%. */}
        <Link
          to={`/coordinator/interns/${s.placementId}`}
          className="block w-40"
          title={`${s.submittedWeeks} of ${s.weeksDue} week${s.weeksDue === 1 ? '' : 's'} due`
            + `${s.progressPct != null ? ` · ${s.progressPct}%` : ''} · last entry ${lastEntry}`}
        >
          <div className="mb-1 flex justify-between text-[10px]">
            <span className="font-bold text-[var(--h-15157d)]">Week {s.lastWeek ?? 0} of {s.programmeWeeks}</span>
            <span className="text-[var(--h-757684)]">{s.progressPct != null ? `${s.progressPct}%` : '—'}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--h-e5eeff)]">
            <div className="h-full bg-[var(--h-15157d)]" style={{ width: `${Math.min(100, Math.max(0, s.progressPct ?? 0))}%` }} />
          </div>
        </Link>
      </td>
      <td className="px-6 py-3 text-right">
        <RowActionsMenu placementId={s.placementId} internName={name} flagged={s.flagged} />
      </td>
    </tr>
  );
}

export default function InternStatusTable({ pageSize = 20, viewAllHref, scopeYearId, initialFilters }: Props) {
  const [sortBy, setSortBy]     = useState<StudentSortKey | undefined>(undefined);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [page, setPage]         = useState(1);
  const [showFilters, setShow]  = useState(!!initialFilters && Object.keys(initialFilters).length > 0);
  const [filters, setFilters]   = useState<Filters>(initialFilters ?? {});
  const [live, setLive]         = useState(false);

  // The dashboard cohort selector (item 17) takes precedence over the in-panel
  // cohort filter when present.
  const effectiveYearId = scopeYearId ?? filters.academicYearId;
  const { data, isLoading, isFetching } = useCoordinatorStudents(
    { page, limit: pageSize, sortBy, sortDir, ...filters, academicYearId: effectiveYearId },
    { refetchInterval: live ? LIVE_POLL_MS : undefined },
  );
  const { data: programmes = [] }  = useCoordinatorProgrammes();
  const { data: cohorts = [] }     = useCoordinatorCohorts();
  const { data: supervisors = [] } = useSupervisors();

  const students = data?.students ?? [];
  const meta     = data?.meta;

  // ── Bulk selection ──
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkSupId, setBulkSupId]         = useState('');
  const [toast, setToast]                 = useState<string | null>(null);
  const bulkRemind = useBulkRemind();
  const bulkAssign = useBulkAssign();

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2500); };
  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const pageIds   = students.map((s) => s.placementId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPage) pageIds.forEach((id) => n.delete(id));
    else pageIds.forEach((id) => n.add(id));
    return n;
  });
  const clearSel = () => setSelected(new Set());

  const doBulkRemind = async () => {
    const n = selected.size;
    await bulkRemind.mutateAsync([...selected]);
    flash(`Reminder sent to ${n} intern${n === 1 ? '' : 's'}`); clearSel();
  };
  const doBulkAssign = async () => {
    if (!bulkSupId) return;
    await bulkAssign.mutateAsync({ placementIds: [...selected], supervisorId: bulkSupId });
    setBulkAssignOpen(false); setBulkSupId(''); flash('Supervisor assigned'); clearSel();
  };
  const doExport = async () => {
    await downloadInternsCsv(selected.size ? [...selected] : undefined, effectiveYearId);
  };

  const onSort = (col: StudentSortKey) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };
  const setFilter = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    setPage(1);
  };
  const setAttention = (v: string) => {
    setFilters((f) => ({ ...f, attention: v === '' ? undefined : v === 'true' }));
    setPage(1);
  };
  // Count active filters, but don't count the cohort filter when the dashboard
  // controls the scope (the in-panel cohort select is hidden then).
  const activeFilters = (Object.entries(filters) as [keyof Filters, unknown][])
    .filter(([k, v]) => v !== undefined && v !== '' && !(k === 'academicYearId' && scopeYearId))
    .length;
  const clearFilters  = () => { setFilters({}); setPage(1); };

  const selectCls = 'rounded-lg border border-[var(--h-c4c5d5-70)] bg-[var(--h-ffffff)] px-2.5 py-1.5 text-sm text-[var(--h-0b1c30)] focus:border-[var(--h-15157d)] focus:outline-none';

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] px-6 py-4">
        <h3 className="text-lg font-semibold text-[var(--h-15157d)]">Intern Status Monitor</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            title={live ? `Live — refreshing every ${LIVE_POLL_MS / 1000}s` : 'Paused — click for live updates'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              live ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-[var(--h-c4c5d5-70)] text-[var(--h-757684)] hover:text-[var(--h-15157d)]'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${live ? `bg-emerald-500 ${isFetching ? 'animate-ping' : 'animate-pulse'}` : 'bg-[var(--h-c4c5d5)]'}`} />
            {live ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={doExport}
            aria-label="Export interns to CSV" title="Export to CSV"
            className="rounded-lg border border-[var(--h-c4c5d5-70)] px-2 py-1.5 text-[var(--h-444653)] transition-colors hover:text-[var(--h-15157d)]"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShow((v) => !v)}
            aria-label="Filter interns"
            className={`relative rounded-lg border px-2 py-1.5 transition-colors ${showFilters || activeFilters ? 'border-[var(--h-15157d)] bg-[var(--h-15157d-5)] text-[var(--h-15157d)]' : 'border-[var(--h-c4c5d5-70)] text-[var(--h-444653)] hover:text-[var(--h-15157d)]'}`}
          >
            <Filter className="h-4 w-4" />
            {activeFilters > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--h-15157d)] text-[9px] font-bold text-white">{activeFilters}</span>
            )}
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-eff4ff)] px-6 py-2.5 text-sm">
          <span className="font-semibold text-[var(--h-15157d)]">{selected.size} selected</span>
          <button onClick={doBulkRemind} disabled={bulkRemind.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5-70)] bg-[var(--h-ffffff)] px-3 py-1.5 text-xs font-semibold text-[var(--h-444653)] transition-colors hover:text-[var(--h-15157d)] disabled:opacity-50">
            <BellRing className="h-3.5 w-3.5" /> Send reminder
          </button>
          <button onClick={() => setBulkAssignOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5-70)] bg-[var(--h-ffffff)] px-3 py-1.5 text-xs font-semibold text-[var(--h-444653)] transition-colors hover:text-[var(--h-15157d)]">
            <UserCheck className="h-3.5 w-3.5" /> Assign supervisor
          </button>
          <button onClick={doExport} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5-70)] bg-[var(--h-ffffff)] px-3 py-1.5 text-xs font-semibold text-[var(--h-444653)] transition-colors hover:text-[var(--h-15157d)]">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button onClick={clearSel} className="ml-auto text-xs font-medium text-[var(--h-757684)] transition-colors hover:text-[var(--h-b3261e)]">Clear</button>
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-6 py-3">
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} className={selectCls} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="returned">Returned</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
          <select value={filters.programmeId ?? ''} onChange={(e) => setFilter('programmeId', e.target.value)} className={selectCls} aria-label="Filter by department">
            <option value="">All departments</option>
            {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filters.supervisorId ?? ''} onChange={(e) => setFilter('supervisorId', e.target.value)} className={selectCls} aria-label="Filter by supervisor">
            <option value="">All supervisors</option>
            <option value="unassigned">Unassigned</option>
            {supervisors.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
          {!scopeYearId && (
            <select value={filters.academicYearId ?? ''} onChange={(e) => setFilter('academicYearId', e.target.value)} className={selectCls} aria-label="Filter by cohort">
              <option value="">All cohorts</option>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isActive ? ' (active)' : ''}</option>)}
            </select>
          )}
          <select value={filters.riskTier ?? ''} onChange={(e) => setFilter('riskTier', e.target.value)} className={selectCls} aria-label="Filter by risk">
            <option value="">All risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select value={filters.attention === undefined ? '' : String(filters.attention)} onChange={(e) => setAttention(e.target.value)} className={selectCls} aria-label="Filter by attention">
            <option value="">All interns</option>
            <option value="true">Needs attention</option>
            <option value="false">On track</option>
          </select>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--h-757684)] transition-colors hover:text-[var(--h-b3261e)]">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[var(--h-eff4ff)] text-xs">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page"
                  className="h-4 w-4 cursor-pointer rounded border-[var(--h-c4c5d5)] text-[var(--h-15157d)] focus:ring-[var(--h-15157d)]" />
              </th>
              <SortHeader label="Intern"     col="name"       sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="px-6" />
              <SortHeader label="Department" col="department" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Supervisor" col="supervisor" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Status"     col="status"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[var(--h-757684)]">Attention</th>
              <SortHeader label="Score"      col="score"      sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Logbook progress" col="progress" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-[var(--h-757684)]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--h-c4c5d5-50)]">
            {isLoading ? (
              <tr><td colSpan={9} className="px-6 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[var(--h-15157d)]" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-[var(--h-757684)]">{activeFilters > 0 ? 'No interns match these filters.' : 'No active interns yet.'}</td></tr>
            ) : (
              students.map((s) => <InternRow key={s.placementId} s={s} selected={selected.has(s.placementId)} onToggle={toggle} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Compact dashboard mode → "View all" link; full mode → pager. */}
      {viewAllHref
        ? meta && meta.total > students.length && (
            <div className="flex justify-center border-t border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] py-4">
              <Link to={viewAllHref} className="text-sm font-semibold text-[var(--h-15157d)] hover:underline">
                View all {meta.total.toLocaleString()} interns
              </Link>
            </div>
          )
        : meta && meta.total > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] px-6 py-3 text-sm">
              <span className="text-[var(--h-757684)]">
                {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.hasPrevPage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--h-c4c5d5-70)] text-[var(--h-444653)] transition-colors hover:bg-[var(--h-dce9ff)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-medium text-[var(--h-0b1c30)]">Page {meta.page} of {meta.totalPages || 1}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={!meta.hasNextPage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--h-c4c5d5-70)] text-[var(--h-444653)] transition-colors hover:bg-[var(--h-dce9ff)] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

      {/* Bulk assign supervisor modal */}
      {bulkAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setBulkAssignOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-[var(--h-ffffff)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--h-0b1c30)]">Assign supervisor to {selected.size} intern{selected.size === 1 ? '' : 's'}</h3>
              <button onClick={() => setBulkAssignOpen(false)} aria-label="Close" className="rounded p-1 text-[var(--h-757684)] hover:bg-[var(--h-eff4ff)]"><X className="h-4 w-4" /></button>
            </div>
            <label className="mb-1 block text-xs font-semibold text-[var(--h-757684)]">Academic supervisor</label>
            <select value={bulkSupId} onChange={(e) => setBulkSupId(e.target.value)} className="w-full rounded-lg border border-[var(--h-c4c5d5-70)] px-3 py-2 text-sm focus:border-[var(--h-15157d)] focus:outline-none">
              <option value="">Select a supervisor…</option>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setBulkAssignOpen(false)} className="rounded-lg border border-[var(--h-c4c5d5-70)] px-4 py-2 text-sm font-medium text-[var(--h-444653)] hover:bg-[var(--h-eff4ff)]">Cancel</button>
              <button onClick={doBulkAssign} disabled={!bulkSupId || bulkAssign.isPending} className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {bulkAssign.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-[var(--h-0b1c30)] px-4 py-2 text-sm font-medium text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

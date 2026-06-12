import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Filter, MoreVertical, Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X,
} from 'lucide-react';
import {
  useCoordinatorStudents, useCoordinatorProgrammes, useCoordinatorCohorts,
  type StudentSortKey, type StudentStatusFilter, type CoordinatorStudent,
} from '@/hooks/useDashboard';
import { useSupervisors } from '@/hooks/usePlacements';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted:    { label: 'Submitted',    cls: 'bg-[#e1e8ff] text-[#15157d]' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[#dcf5e6] text-[#1b7a45]' },
  returned:     { label: 'Returned',     cls: 'bg-[#ffe2dc] text-[#b3261e]' },
  rejected:     { label: 'Rejected',     cls: 'bg-[#fde7e7] text-[#8a1c1c]' },
  draft:        { label: 'Draft',        cls: 'bg-[#fff4e0] text-[#9a6700]' },
  not_started:  { label: 'Not started',  cls: 'bg-[#eef0f5] text-[#64748b]' },
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
}

interface Props {
  pageSize?: number;
  /** Poll interval (ms) when the Live toggle is on; undefined = static. */
  refetchInterval?: number;
  /** Compact dashboard mode: show a "View all" link to this href instead of pager. */
  viewAllHref?: string;
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
        className={`inline-flex items-center gap-1 font-semibold tracking-wide transition-colors hover:text-[#15157d] ${active ? 'text-[#15157d]' : 'text-[#757684]'}`}
      >
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function InternRow({ s }: { s: CoordinatorStudent }) {
  const name = `${s.student.firstName} ${s.student.lastName}`;
  const status = STATUS_META[s.lastStatus ?? 'not_started'] ?? STATUS_META.not_started;
  const lastEntry = s.lastSubmittedAt
    ? new Date(s.lastSubmittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : '—';
  return (
    <tr className="transition-colors hover:bg-[#eff4ff]">
      <td className="px-6 py-3">
        <Link to={`/coordinator/assignments`} className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e1e0ff] text-[11px] font-bold text-[#15157d]">{initials(name)}</div>
          <div>
            <p className="text-sm font-bold leading-tight text-[#0b1c30]">{name}</p>
            <p className="font-mono text-xs text-[#757684]">#{s.placementId.slice(0, 6).toUpperCase()}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-[#0b1c30]">{s.department ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-[#0b1c30]">
        {s.supervisor?.name?.trim() ? s.supervisor.name : <span className="text-[#757684]">Unassigned</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.cls}`}>{status.label}</span>
      </td>
      <td className="px-4 py-3">
        {s.riskTier ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${RISK_CLS[s.riskTier]}`}>
            {s.riskTier}{s.riskScore != null && ` · ${s.riskScore.toFixed(2)}`}
          </span>
        ) : <span className="text-sm text-[#757684]">—</span>}
      </td>
      <td className="px-4 py-3">
        <Link to={`/coordinator/assignments`} className="block w-40" title={`${s.submittedWeeks}/${s.totalWeeks} weeks · ${s.progressPct}% · last entry ${lastEntry}`}>
          <div className="mb-1 flex justify-between text-[10px]">
            <span className="font-bold text-[#15157d]">Week {s.lastWeek ?? 0} of {s.totalWeeks || 6}</span>
            <span className="text-[#757684]">{s.progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
            <div className="h-full bg-[#15157d]" style={{ width: `${Math.min(100, Math.max(0, s.progressPct))}%` }} />
          </div>
        </Link>
      </td>
      <td className="px-6 py-3 text-right">
        <Link to={`/coordinator/assignments`} aria-label={`View ${name}`} className="inline-flex text-[#757684] transition-colors hover:text-[#15157d]">
          <MoreVertical className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  );
}

export default function InternStatusTable({ pageSize = 20, refetchInterval, viewAllHref }: Props) {
  const [sortBy, setSortBy]     = useState<StudentSortKey | undefined>(undefined);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc');
  const [page, setPage]         = useState(1);
  const [showFilters, setShow]  = useState(false);
  const [filters, setFilters]   = useState<Filters>({});

  const { data, isLoading } = useCoordinatorStudents(
    { page, limit: pageSize, sortBy, sortDir, ...filters },
    { refetchInterval },
  );
  const { data: programmes = [] }  = useCoordinatorProgrammes();
  const { data: cohorts = [] }     = useCoordinatorCohorts();
  const { data: supervisors = [] } = useSupervisors();

  const students = data?.students ?? [];
  const meta     = data?.meta;

  const onSort = (col: StudentSortKey) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  };
  const setFilter = (k: keyof Filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v || undefined }));
    setPage(1);
  };
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters  = () => { setFilters({}); setPage(1); };

  const selectCls = 'rounded-lg border border-[#c4c5d5]/70 bg-white px-2.5 py-1.5 text-sm text-[#0b1c30] focus:border-[#15157d] focus:outline-none';

  return (
    <div className="overflow-hidden rounded-xl border border-[#c4c5d5]/60 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#c4c5d5]/60 bg-[#f8f9ff] px-6 py-4">
        <h3 className="text-lg font-semibold text-[#15157d]">Intern Status Monitor</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShow((v) => !v)}
            aria-label="Filter interns"
            className={`relative rounded-lg border px-2 py-1.5 transition-colors ${showFilters || activeFilters ? 'border-[#15157d] bg-[#15157d]/5 text-[#15157d]' : 'border-[#c4c5d5]/70 text-[#444653] hover:text-[#15157d]'}`}
          >
            <Filter className="h-4 w-4" />
            {activeFilters > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#15157d] text-[9px] font-bold text-white">{activeFilters}</span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#c4c5d5]/60 bg-white px-6 py-3">
          <select value={filters.status ?? ''} onChange={(e) => setFilter('status', e.target.value)} className={selectCls} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="not_started">Not started</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="returned">Returned</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="rejected">Rejected</option>
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
          <select value={filters.academicYearId ?? ''} onChange={(e) => setFilter('academicYearId', e.target.value)} className={selectCls} aria-label="Filter by cohort">
            <option value="">All cohorts</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.label}{c.isActive ? ' (active)' : ''}</option>)}
          </select>
          <select value={filters.riskTier ?? ''} onChange={(e) => setFilter('riskTier', e.target.value)} className={selectCls} aria-label="Filter by risk">
            <option value="">All risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-medium text-[#757684] transition-colors hover:text-[#b3261e]">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-[#eff4ff] text-xs">
            <tr>
              <SortHeader label="Intern"     col="name"       sortBy={sortBy} sortDir={sortDir} onSort={onSort} className="px-6" />
              <SortHeader label="Department" col="department" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Supervisor" col="supervisor" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Status"     col="status"     sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Score"      col="score"      sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Logbook progress" col="progress" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <th className="px-6 py-3 text-right text-xs font-semibold tracking-wide text-[#757684]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c4c5d5]/50">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-[#15157d]" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-[#757684]">{activeFilters > 0 ? 'No interns match these filters.' : 'No active interns yet.'}</td></tr>
            ) : (
              students.map((s) => <InternRow key={s.placementId} s={s} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Compact dashboard mode → "View all" link; full mode → pager. */}
      {viewAllHref
        ? meta && meta.total > students.length && (
            <div className="flex justify-center border-t border-[#c4c5d5]/60 bg-[#f8f9ff] py-4">
              <Link to={viewAllHref} className="text-sm font-semibold text-[#15157d] hover:underline">
                View all {meta.total.toLocaleString()} interns
              </Link>
            </div>
          )
        : meta && meta.total > 0 && (
            <div className="flex items-center justify-between border-t border-[#c4c5d5]/60 bg-[#f8f9ff] px-6 py-3 text-sm">
              <span className="text-[#757684]">
                {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.hasPrevPage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#c4c5d5]/70 text-[#444653] transition-colors hover:bg-[#dce9ff] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-medium text-[#0b1c30]">Page {meta.page} of {meta.totalPages || 1}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={!meta.hasNextPage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#c4c5d5]/70 text-[#444653] transition-colors hover:bg-[#dce9ff] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
    </div>
  );
}

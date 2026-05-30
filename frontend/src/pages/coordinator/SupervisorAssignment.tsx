import { useState } from 'react';
import { Loader2, UserCheck, Check, GraduationCap } from 'lucide-react';
import {
  useAllPlacements,
  useSupervisors,
  useAssignSupervisor,
  type Placement,
} from '@/hooks/usePlacements';

type StatusFilter = 'active' | 'pending' | 'all';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'active',  label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'all',     label: 'All' },
];

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  pending:   'bg-amber-500/10 text-amber-300 border-amber-500/30',
  rejected:  'bg-red-500/10 text-red-300 border-red-500/30',
  completed: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-700/40 text-slate-300 border-slate-600';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>{label}</span>
  );
}

function AssignmentRow({ placement }: { placement: Placement }) {
  const { data: supervisors = [] } = useSupervisors();
  const assign = useAssignSupervisor();

  const currentId = placement.academicSupervisor?.id ?? '';
  const [choice, setChoice] = useState<string>(currentId);
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-200 truncate">{studentName}</span>
          <StatusBadge status={placement.placementStatus} />
        </div>
        <p className="text-xs text-slate-400">
          {placement.company?.name ?? 'No company'} ·{' '}
          {currentName ? (
            <span className="text-slate-300">Supervisor: {currentName}</span>
          ) : (
            <span className="text-amber-400/90">Unassigned</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <select
          value={choice}
          onChange={(e) => { setChoice(e.target.value); setSavedAt(null); }}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer min-w-[14rem]"
        >
          <option value="">Select supervisor…</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>

        {savedAt ? (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400 px-2">
            <Check className="w-4 h-4" /> Saved
          </span>
        ) : (
          <button
            onClick={save}
            disabled={!dirty || assign.isPending}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {assign.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <UserCheck className="w-4 h-4" />}
            {currentName ? 'Reassign' : 'Assign'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SupervisorAssignment() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const { data, isLoading } = useAllPlacements(1, filter === 'all' ? undefined : filter);

  const placements = data?.placements ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Supervisor Assignments</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Assign an academic supervisor to each placement. The supervisor's dashboard
            populates as soon as they're assigned.
          </p>
        </div>
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                filter === f.key
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        </div>
      ) : placements.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <GraduationCap className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No {filter === 'all' ? '' : filter} placements found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {placements.map((p) => <AssignmentRow key={p.id} placement={p} />)}
        </div>
      )}
    </div>
  );
}

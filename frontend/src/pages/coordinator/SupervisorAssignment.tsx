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
  active:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  rejected:  'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-[#e5eeff] text-[#15157d] border-[#c4c5d5]',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-[#f8f9ff] text-[#757684] border-[#c4c5d5]';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
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
    <div className="flex flex-col gap-4 rounded-xl border border-[#c4c5d5]/60 bg-white px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#0b1c30]">{studentName}</span>
          <StatusBadge status={placement.placementStatus} />
        </div>
        <p className="text-xs text-[#757684]">
          {placement.company?.name ?? 'No company'} ·{' '}
          {currentName ? (
            <span className="text-[#444653]">Supervisor: {currentName}</span>
          ) : (
            <span className="text-amber-600">Unassigned</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <select
          value={choice}
          onChange={(e) => { setChoice(e.target.value); setSavedAt(null); }}
          className="min-w-[14rem] cursor-pointer rounded-lg border border-[#c4c5d5] bg-white px-3 py-2 text-sm text-[#0b1c30] transition-colors focus:border-[#15157d] focus:outline-none focus:ring-1 focus:ring-[#15157d]"
        >
          <option value="">Select supervisor…</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
          ))}
        </select>

        {savedAt ? (
          <span className="flex items-center gap-1.5 px-2 text-xs text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        ) : (
          <button
            onClick={save}
            disabled={!dirty || assign.isPending}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#15157d] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {assign.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <UserCheck className="h-4 w-4" />}
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
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0b1c30]">Supervisor Assignments</h1>
          <p className="mt-0.5 text-sm text-[#757684]">
            Assign an academic supervisor to each placement. The supervisor's dashboard
            populates as soon as they're assigned.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[#c4c5d5]/60 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-[#15157d] text-white'
                  : 'text-[#757684] hover:text-[#15157d]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#15157d]" />
        </div>
      ) : placements.length === 0 ? (
        <div className="rounded-xl border border-[#c4c5d5]/60 bg-white p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-[#757684]" />
          <p className="text-sm text-[#757684]">No {filter === 'all' ? '' : filter} placements found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {placements.map((p) => <AssignmentRow key={p.id} placement={p} />)}
        </div>
      )}
    </div>
  );
}

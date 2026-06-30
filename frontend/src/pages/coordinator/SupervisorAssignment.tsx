import { useState } from 'react';
import { Loader2, UserCheck, Check, GraduationCap, MapPin, Inbox } from 'lucide-react';
import {
  useAllPlacements,
  useSupervisors,
  useAssignSupervisor,
  useSetSupervisorRegion,
  useUnassignedPlacements,
  type Placement,
  type Supervisor,
  type UnassignedPlacement,
} from '@/hooks/usePlacements';
import SupervisorPicker from '@/components/shared/SupervisorPicker';
import SupervisorUploadPanel from '@/components/coordinator/SupervisorUploadPanel';
import { REGION_VALUES, REGION_LABELS, regionLabel } from '@/lib/regions';

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
  completed: 'bg-[var(--h-e5eeff)] text-[var(--h-15157d)] border-[var(--h-c4c5d5)]',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-[var(--h-f8f9ff)] text-[var(--h-757684)] border-[var(--h-c4c5d5)]';
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
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--h-0b1c30)]">{studentName}</span>
          <StatusBadge status={placement.placementStatus} />
        </div>
        <p className="text-xs text-[var(--h-757684)]">
          {placement.company?.name ?? 'No company'} ·{' '}
          {currentName ? (
            <span className="text-[var(--h-444653)]">Supervisor: {currentName}</span>
          ) : (
            <span className="text-amber-600">Unassigned</span>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SupervisorPicker
          supervisors={supervisors}
          value={choice}
          onChange={(id) => { setChoice(id); setSavedAt(null); }}
          placeholder="Select supervisor…"
          className="min-w-[14rem]"
        />

        {savedAt ? (
          <span className="flex items-center gap-1.5 px-2 text-xs text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        ) : (
          <button
            onClick={save}
            disabled={!dirty || assign.isPending}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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

// ── Supervisor regions ──────────────────────────────────────────
// Each academic supervisor covers one region; new interns placed there are
// auto-balanced across everyone sharing it. Load = live (pending + active) count.

function SupervisorRegionRow({ supervisor }: { supervisor: Supervisor }) {
  const setRegion = useSetSupervisorRegion();
  const current = supervisor.region ?? '';

  const onChange = (value: string) =>
    setRegion.mutate({ id: supervisor.id, region: value === '' ? null : value });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--h-0b1c30)]">
          {supervisor.firstName} {supervisor.lastName}
        </p>
        <p className="text-xs text-[var(--h-757684)]">
          {supervisor.load ?? 0} active {(supervisor.load ?? 0) === 1 ? 'intern' : 'interns'}
          {supervisor.region ? <> · {regionLabel(supervisor.region)}</> : <span className="text-amber-600"> · No region</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          disabled={setRegion.isPending}
          className="min-w-[12rem] cursor-pointer rounded-lg border border-[var(--h-c4c5d5)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-1 focus:ring-[var(--h-15157d)] disabled:opacity-50"
        >
          <option value="">No region</option>
          {REGION_VALUES.map((r) => (
            <option key={r} value={r}>{REGION_LABELS[r]}</option>
          ))}
        </select>
        {setRegion.isPending && <Loader2 className="h-4 w-4 animate-spin text-[var(--h-15157d)]" />}
      </div>
    </div>
  );
}

function SupervisorRegionsPanel() {
  const { data: supervisors = [], isLoading } = useSupervisors();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[var(--h-15157d)]" />
        <h2 className="text-sm font-semibold text-[var(--h-0b1c30)]">Supervisor regions</h2>
      </div>
      <p className="text-sm text-[var(--h-757684)]">
        Set the region each academic supervisor covers. New interns who register in a
        region are auto-assigned to the least-loaded supervisor there.
      </p>
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" />
        </div>
      ) : supervisors.length === 0 ? (
        <div className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-8 text-center text-sm text-[var(--h-757684)]">
          No academic supervisors registered yet.
        </div>
      ) : (
        <div className="space-y-3">
          {supervisors.map((s) => <SupervisorRegionRow key={s.id} supervisor={s} />)}
        </div>
      )}
    </section>
  );
}

// ── Needs-supervisor queue ───────────────────────────────────────
// Interns whose region had no supervisor at registration sit pending here.

function UnassignedRow({ placement }: { placement: UnassignedPlacement }) {
  const { data: supervisors = [] } = useSupervisors();
  const assign = useAssignSupervisor();
  const [choice, setChoice] = useState('');

  const save = () => {
    if (!choice) return;
    assign.mutate({ id: placement.id, supervisorId: choice });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/40 px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--h-0b1c30)]">{placement.student.name}</p>
        <p className="text-xs text-[var(--h-757684)]">
          {placement.company ?? 'No company'} · {regionLabel(placement.region)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SupervisorPicker
          supervisors={supervisors}
          value={choice}
          onChange={setChoice}
          placeholder="Select supervisor…"
          className="min-w-[14rem]"
        />
        <button
          onClick={save}
          disabled={!choice || assign.isPending}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-[var(--h-0b1c30)]">
          Needs a supervisor
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">{unassigned.length}</span>
        </h2>
      </div>
      <p className="text-sm text-[var(--h-757684)]">
        These interns registered in a region with no supervisor configured. Assign one
        directly, or set a region above so future interns auto-assign.
      </p>
      <div className="space-y-3">
        {unassigned.map((p) => <UnassignedRow key={p.id} placement={p} />)}
      </div>
    </section>
  );
}

export default function SupervisorAssignment() {
  const [filter, setFilter] = useState<StatusFilter>('active');
  const { data, isLoading } = useAllPlacements(1, filter === 'all' ? undefined : filter);

  const placements = data?.placements ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Supervisor Assignments</h1>
        <p className="mt-0.5 text-sm text-[var(--h-757684)]">
          Set the region each supervisor covers (new interns auto-assign), clear the
          needs-supervisor queue, and reassign any existing placement below.
        </p>
      </div>

      <SupervisorUploadPanel />
      <SupervisorRegionsPanel />
      <NeedsSupervisorPanel />

      <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--h-0b1c30)]">All placements</h2>
          <p className="mt-0.5 text-sm text-[var(--h-757684)]">
            Reassign the academic supervisor on any placement. The supervisor's dashboard
            populates as soon as they're assigned.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-[var(--h-15157d)] text-white'
                  : 'text-[var(--h-757684)] hover:text-[var(--h-15157d)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
        </div>
      ) : placements.length === 0 ? (
        <div className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-[var(--h-757684)]" />
          <p className="text-sm text-[var(--h-757684)]">No {filter === 'all' ? '' : filter} placements found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {placements.map((p) => <AssignmentRow key={p.id} placement={p} />)}
        </div>
      )}
      </section>
    </div>
  );
}

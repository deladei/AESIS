import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAllPlacements, useUpdatePlacementStatus, useSupervisors } from '@/hooks/usePlacements';

function InfoBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold tracking-wide text-[#757684]">{label}</p>
      <p className="text-sm text-[#0b1c30]">{value}</p>
      {sub && <p className="text-xs text-[#757684]">{sub}</p>}
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlacementApproval() {
  const { data, isLoading }    = useAllPlacements(1, 'pending');
  const { data: supervisors = [] } = useSupervisors();
  const updateStatus = useUpdatePlacementStatus();

  const [expanded, setExpanded]               = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput]   = useState<Record<string, boolean>>({});
  const [processed, setProcessed]               = useState<Record<string, 'approved' | 'rejected'>>({});
  const [selectedSupervisor, setSelectedSupervisor] = useState<Record<string, string>>({});

  const placements = data?.placements ?? [];

  const approve = async (id: string) => {
    const supervisorId = selectedSupervisor[id] || undefined;
    await updateStatus.mutateAsync({ id, status: 'active', supervisorId });
    setProcessed((prev) => ({ ...prev, [id]: 'approved' }));
  };

  const reject = async (id: string) => {
    const reason = rejectionReasons[id]?.trim();
    if (!reason) return;
    await updateStatus.mutateAsync({ id, status: 'rejected', rejectionReason: reason });
    setProcessed((prev) => ({ ...prev, [id]: 'rejected' }));
  };

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-[#15157d]" /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-[#0b1c30]">Placement Approval</h1>
        <p className="mt-0.5 text-sm text-[#757684]">{placements.length} pending review</p>
      </div>

      {placements.length === 0 && (
        <div className="rounded-xl border border-[#c4c5d5]/60 bg-white p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
          <p className="text-sm text-[#757684]">No pending placements to review.</p>
        </div>
      )}

      {placements.map((p) => {
        const isExpanded = expanded === p.id;
        const done       = !!processed[p.id];
        const studentName = p.student
          ? `${p.student.firstName} ${p.student.lastName}`
          : p.studentId;
        const companyName = p.company?.name ?? '—';

        return (
          <div
            key={p.id}
            className={`overflow-hidden rounded-xl border bg-white transition-colors ${
              done ? 'border-emerald-300' : 'border-[#c4c5d5]/60'
            }`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : p.id)}
              className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#eff4ff]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e1e0ff]">
                <span className="text-[11px] font-bold text-[#15157d]">
                  {studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#0b1c30]">{studentName}</span>
                </div>
                <p className="text-xs text-[#757684]">{companyName} · Submitted {formatDate(p.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {done ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> Processed
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-amber-600">
                    <Clock className="h-3.5 w-3.5" /> Pending
                  </span>
                )}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-[#757684]" /> : <ChevronDown className="h-4 w-4 text-[#757684]" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-[#c4c5d5]/60 px-5 pb-5">
                <div className="my-4 grid gap-4 sm:grid-cols-2">
                  <InfoBlock label="Company"         value={companyName} />
                  <InfoBlock label="Student email"   value={p.student?.email ?? '—'} />
                  <InfoBlock label="Start date"      value={formatDate(p.startDate)} />
                  <InfoBlock label="End date"        value={formatDate(p.endDate)} />
                </div>

                {!done && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[#757684]">
                        Academic supervisor <span className="font-normal text-[#9a9bad]">(optional — can assign later)</span>
                      </label>
                      <select
                        value={selectedSupervisor[p.id] ?? ''}
                        onChange={(e) => setSelectedSupervisor((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-full cursor-pointer rounded-lg border border-[#c4c5d5] bg-white px-3 py-2.5 text-sm text-[#0b1c30] transition-colors focus:border-[#15157d] focus:outline-none focus:ring-1 focus:ring-[#15157d]"
                      >
                        <option value="">No supervisor yet</option>
                        {supervisors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.firstName} {s.lastName} — {s.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => approve(p.id)}
                        disabled={updateStatus.isPending}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updateStatus.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Approve placement
                      </button>
                      <button
                        onClick={() => setShowRejectInput((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        disabled={updateStatus.isPending}
                        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>

                    {showRejectInput[p.id] && (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={rejectionReasons[p.id] || ''}
                          onChange={(e) => setRejectionReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Provide a reason for rejection (required — sent to student)…"
                          className="w-full resize-none rounded-lg border border-red-200 bg-white px-4 py-3 text-sm text-[#0b1c30] placeholder-[#9a9bad] transition-colors focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        />
                        <button
                          onClick={() => reject(p.id)}
                          disabled={!rejectionReasons[p.id]?.trim() || updateStatus.isPending}
                          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Confirm rejection
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAllPlacements, useUpdatePlacementStatus, useSupervisors } from '@/hooks/usePlacements';

function InfoBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
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
    return <div className="p-6 flex justify-center items-center h-64"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Placement Approval</h1>
        <p className="text-slate-400 text-sm mt-0.5">{placements.length} pending review</p>
      </div>

      {placements.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No pending placements to review.</p>
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
            className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
              done ? 'border-emerald-500/30' : 'border-slate-800'
            }`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : p.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-800/20 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-slate-400 font-mono">
                  {studentName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-200">{studentName}</span>
                </div>
                <p className="text-xs text-slate-400">{companyName} · Submitted {formatDate(p.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {done ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Processed
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400">
                    <Clock className="w-3.5 h-3.5" /> Pending
                  </span>
                )}
                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {isExpanded && (
              <div className="px-5 pb-5 border-t border-slate-800">
                <div className="grid sm:grid-cols-2 gap-4 my-4">
                  <InfoBlock label="Company"         value={companyName} />
                  <InfoBlock label="Student Email"   value={p.student?.email ?? '—'} />
                  <InfoBlock label="Start Date"      value={formatDate(p.startDate)} />
                  <InfoBlock label="End Date"        value={formatDate(p.endDate)} />
                </div>

                {!done && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 font-semibold mb-1.5">
                        Academic supervisor <span className="font-normal text-slate-600">(optional — can assign later)</span>
                      </label>
                      <select
                        value={selectedSupervisor[p.id] ?? ''}
                        onChange={(e) => setSelectedSupervisor((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
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
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updateStatus.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Approve Placement
                      </button>
                      <button
                        onClick={() => setShowRejectInput((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        disabled={updateStatus.isPending}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle className="w-4 h-4" />
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
                          className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-red-500/30 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors resize-none"
                        />
                        <button
                          onClick={() => reject(p.id)}
                          disabled={!rejectionReasons[p.id]?.trim() || updateStatus.isPending}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                          Confirm Rejection
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

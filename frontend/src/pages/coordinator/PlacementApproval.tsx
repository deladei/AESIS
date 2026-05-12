import { useState } from 'react';
import { CheckCircle2, XCircle, FileText, ExternalLink, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface Placement {
  id: string;
  student: { name: string; programme: string; level: string };
  company: string;
  address: string;
  companySupervisor: { name: string; email: string };
  startDate: string;
  endDate: string;
  submittedAt: string;
  documentUrl: string;
}

const pendingPlacements: Placement[] = [
  {
    id: '1',
    student: { name: 'Adaeze Okonkwo', programme: 'B.Sc. Software Engineering', level: '400' },
    company: 'FinTech Solutions Nigeria',
    address: '14 Marina St, Lagos Island, Lagos',
    companySupervisor: { name: 'Mr. Babatunde Adeyemi', email: 'b.adeyemi@fintechng.com' },
    startDate: '2 June 2025',
    endDate: '29 August 2025',
    submittedAt: '10 May 2025',
    documentUrl: '#',
  },
  {
    id: '2',
    student: { name: 'Damilola Fashola', programme: 'B.Sc. Computer Science', level: '400' },
    company: 'Andela Nigeria',
    address: '4 Sapara Williams Close, V/I, Lagos',
    companySupervisor: { name: 'Ms. Chiamaka Obi', email: 'c.obi@andela.com' },
    startDate: '2 June 2025',
    endDate: '29 August 2025',
    submittedAt: '11 May 2025',
    documentUrl: '#',
  },
];

export default function PlacementApproval() {
  const [expanded, setExpanded] = useState<string | null>('1');
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Record<string, 'approving' | 'rejecting' | 'done'>>({});
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({});

  const approve = async (id: string) => {
    setActions((prev) => ({ ...prev, [id]: 'approving' }));
    await new Promise((r) => setTimeout(r, 1200));
    setActions((prev) => ({ ...prev, [id]: 'done' }));
  };

  const reject = async (id: string) => {
    if (!rejectionReasons[id]?.trim()) return;
    setActions((prev) => ({ ...prev, [id]: 'rejecting' }));
    await new Promise((r) => setTimeout(r, 1200));
    setActions((prev) => ({ ...prev, [id]: 'done' }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Placement Approval</h1>
        <p className="text-slate-400 text-sm mt-0.5">{pendingPlacements.length} pending review</p>
      </div>

      {pendingPlacements.map((p) => {
        const isExpanded = expanded === p.id;
        const action = actions[p.id];
        const isDone = action === 'done';

        return (
          <div
            key={p.id}
            className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
              isDone ? 'border-emerald-500/30' : 'border-slate-800'
            }`}
          >
            {/* Header row */}
            <button
              onClick={() => setExpanded(isExpanded ? null : p.id)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-800/20 transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-slate-400 font-mono">
                  {p.student.name.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-200">{p.student.name}</span>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs text-slate-500">{p.student.level}L {p.student.programme.replace('B.Sc. ', '')}</span>
                </div>
                <p className="text-xs text-slate-400">{p.company} · Submitted {p.submittedAt}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isDone ? (
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

            {/* Expanded detail */}
            {isExpanded && (
              <div className="px-5 pb-5 border-t border-slate-800">
                <div className="grid sm:grid-cols-2 gap-4 my-4">
                  <InfoBlock label="Company" value={p.company} />
                  <InfoBlock label="Address" value={p.address} />
                  <InfoBlock label="Company Supervisor" value={`${p.companySupervisor.name}`} sub={p.companySupervisor.email} />
                  <InfoBlock label="Placement Dates" value={`${p.startDate} — ${p.endDate}`} />
                </div>

                <a
                  href={p.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 mb-5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs font-medium transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Placement Letter
                  <ExternalLink className="w-3 h-3" />
                </a>

                {!isDone && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => approve(p.id)}
                        disabled={!!action}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/30 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {action === 'approving' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Approve Placement
                      </button>
                      <button
                        onClick={() => setShowRejectInput((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        disabled={!!action}
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
                          disabled={!rejectionReasons[p.id]?.trim() || !!action}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {action === 'rejecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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

function InfoBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

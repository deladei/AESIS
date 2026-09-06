import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MoreVertical, User, FileText, UserCheck, MessageSquare, BellRing, Loader2, X, Flag,
} from 'lucide-react';
import { useSupervisors, useAssignSupervisor } from '@/hooks/usePlacements';
import { useMessageStudent, useRemindStudent, useSetFlag } from '@/hooks/useDashboard';

interface Props {
  placementId: string;
  internName: string;
  flagged?: boolean;
  /** Optional toast sink so callers can surface confirmations consistently. */
  onDone?: (message: string) => void;
}

export default function RowActionsMenu({ placementId, internName, flagged = false, onDone }: Props) {
  const navigate = useNavigate();
  const [open, setOpen]   = useState(false);
  const [modal, setModal] = useState<null | 'reassign' | 'message' | 'flag'>(null);
  const [supId, setSupId] = useState('');
  const [msg, setMsg]     = useState('');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const { data: supervisors = [] } = useSupervisors();
  const assign  = useAssignSupervisor();
  const message = useMessageStudent();
  const remind  = useRemindStudent();
  const setFlag = useSetFlag();

  const flash = (t: string) => {
    if (onDone) onDone(t);
    else { setToast(t); setTimeout(() => setToast(null), 2500); }
  };
  const go = (path: string) => { setOpen(false); navigate(path); };

  const doReassign = async () => {
    if (!supId) return;
    await assign.mutateAsync({ id: placementId, supervisorId: supId });
    setModal(null); setSupId(''); flash('Supervisor reassigned');
  };
  const doMessage = async () => {
    if (!msg.trim()) return;
    await message.mutateAsync({ placementId, message: msg.trim() });
    setModal(null); setMsg(''); flash('Message sent');
  };
  const doRemind = async () => {
    setOpen(false);
    await remind.mutateAsync(placementId);
    flash('Reminder sent');
  };
  const doFlag = async () => {
    await setFlag.mutateAsync({ placementId, flagged: true, reason: reason.trim() || undefined });
    setModal(null); setReason(''); flash('Flagged for attention');
  };
  const doUnflag = async () => {
    setOpen(false);
    await setFlag.mutateAsync({ placementId, flagged: false });
    flash('Flag removed');
  };

  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-brand-soft';

  return (
    <>
      <div className="relative inline-block text-left">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={`Actions for ${internName}`} aria-haspopup="menu" aria-expanded={open}
          className="inline-flex rounded p-1 text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand-ink"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
              <button className={item} onClick={() => go(`/coordinator/interns/${placementId}`)}><User className="h-4 w-4 text-ink-muted" /> View profile</button>
              <button className={item} onClick={() => go(`/coordinator/interns/${placementId}`)}><FileText className="h-4 w-4 text-ink-muted" /> View logs</button>
              <button className={item} onClick={() => { setOpen(false); setModal('reassign'); }}><UserCheck className="h-4 w-4 text-ink-muted" /> Reassign supervisor</button>
              <button className={item} onClick={() => { setOpen(false); setModal('message'); }}><MessageSquare className="h-4 w-4 text-ink-muted" /> Message</button>
              <button className={item} onClick={doRemind} disabled={remind.isPending}>
                {remind.isPending ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" /> : <BellRing className="h-4 w-4 text-ink-muted" />} Send reminder
              </button>
              {flagged ? (
                <button className={item} onClick={doUnflag} disabled={setFlag.isPending}>
                  <Flag className="h-4 w-4 text-warn" /> Remove flag
                </button>
              ) : (
                <button className={item} onClick={() => { setOpen(false); setModal('flag'); }}>
                  <Flag className="h-4 w-4 text-ink-muted" /> Flag for attention
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {modal === 'reassign' ? 'Reassign supervisor' : modal === 'flag' ? `Flag ${internName}` : `Message ${internName}`}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Close" className="rounded p-1 text-ink-muted hover:bg-brand-soft"><X className="h-4 w-4" /></button>
            </div>

            {modal === 'flag' ? (
              <>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Reason (optional)</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder="Why are you flagging this intern for attention?" className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setModal(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-brand-soft">Cancel</button>
                  <button onClick={doFlag} disabled={setFlag.isPending} className="inline-flex items-center gap-2 rounded-lg bg-warn px-4 py-2 text-sm font-semibold text-white hover:bg-warn disabled:opacity-50">
                    {setFlag.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Flag
                  </button>
                </div>
              </>
            ) : modal === 'reassign' ? (
              <>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">Academic supervisor</label>
                <select value={supId} onChange={(e) => setSupId(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-brand focus:outline-none">
                  <option value="">Select a supervisor…</option>
                  {supervisors.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setModal(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-brand-soft">Cancel</button>
                  <button onClick={doReassign} disabled={!supId || assign.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Reassign
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} maxLength={2000} placeholder="Write a message — it reaches the intern's notifications." className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setModal(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-brand-soft">Cancel</button>
                  <button onClick={doMessage} disabled={!msg.trim() || message.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {message.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-ink-inverse shadow-lg">{toast}</div>
      )}
    </>
  );
}

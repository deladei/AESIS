import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Mail, Building2, CalendarDays, GraduationCap, MessageSquare, Shield, Flag,
} from 'lucide-react';
import { useInternDetail } from '@/hooks/useDashboard';

const STATUS_CLS: Record<string, string> = {
  submitted:    'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)]',
  acknowledged: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]',
  returned:     'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)]',
  draft:        'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)]',
};
const RISK_CLS: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700',
};

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}
function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');
}

export default function InternDetail() {
  const { placementId } = useParams<{ placementId: string }>();
  const { data, isLoading, isError, refetch } = useInternDetail(placementId);

  if (isLoading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" /></div>;
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-[var(--h-444653)]">Couldn't load this intern.</p>
        <button onClick={() => refetch()} className="rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Try again</button>
      </div>
    );
  }

  const { student, placement, supervisors, progress, avgQuality, entries, riskHistory, feedback, supervisorHistory } = data;
  const card = 'rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-5';

  return (
    <div className="p-6">
      <Link to="/coordinator/interns" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-15157d)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> All interns
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--h-e1e0ff)] text-lg font-bold text-[var(--h-15157d)]">
            {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--h-0b1c30)]">{student.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--h-757684)]">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{student.email}</span>
              {student.department && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{student.department}</span>}
              {placement.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{placement.company}</span>}
              {placement.cohort && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{placement.cohort}</span>}
            </div>
          </div>
        </div>
        <span className="rounded-full border border-[var(--h-c4c5d5-70)] px-3 py-1 text-xs font-semibold capitalize text-[var(--h-15157d)]">{placement.status}</span>
      </div>

      {placement.flagged && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Flag className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" />
          <span><strong>Flagged for attention.</strong>{placement.flagReason ? ` ${placement.flagReason}` : ''}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Progress + quality */}
        <div className={card}>
          <p className="text-xs font-semibold tracking-wide text-[var(--h-757684)]">Logbook progress</p>
          <p className="mt-2 text-3xl font-bold text-[var(--h-0b1c30)]">{progress.submittedWeeks}<span className="text-lg text-[var(--h-757684)]"> / {progress.totalWeeks} weeks</span></p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--h-e5eeff)]">
            <div className="h-full rounded-full bg-[var(--h-15157d)]" style={{ width: `${Math.min(100, Math.max(0, progress.progressPct))}%` }} />
          </div>
          <p className="mt-3 text-xs text-[var(--h-757684)]">Avg quality score: <span className="font-bold text-[var(--h-0b1c30)]">{avgQuality != null ? avgQuality.toFixed(1) : '—'}</span></p>
        </div>

        {/* Supervisors */}
        <div className={card}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--h-757684)]">Supervisors</p>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--h-757684)]">Academic</p>
              {supervisors.academic ? (
                <><p className="text-sm font-bold text-[var(--h-0b1c30)]">{supervisors.academic.name}</p><p className="text-xs text-[var(--h-757684)]">{supervisors.academic.email}</p></>
              ) : <p className="text-sm text-[var(--h-757684)]">Unassigned</p>}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--h-757684)]">Company</p>
              {supervisors.company ? (
                <><p className="text-sm font-bold text-[var(--h-0b1c30)]">{supervisors.company.name}</p><p className="text-xs text-[var(--h-757684)]">{supervisors.company.email}</p></>
              ) : <p className="text-sm text-[var(--h-757684)]">Unassigned</p>}
            </div>
          </div>
        </div>

        {/* Risk history */}
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--h-757684)]"><Shield className="h-3.5 w-3.5" /> Risk history</p>
          {riskHistory.length === 0 ? <p className="text-sm text-[var(--h-757684)]">No risk scores yet.</p> : (
            <ul className="space-y-2">
              {riskHistory.slice(0, 5).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${RISK_CLS[r.tier]}`}>{r.tier} · {r.score.toFixed(2)}</span>
                  <span className="text-xs text-[var(--h-757684)]">{fmt(r.computedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)]">
        <div className="border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] px-6 py-4"><h3 className="text-lg font-semibold text-[var(--h-15157d)]">Logbook entries</h3></div>
        {entries.length === 0 ? <p className="px-6 py-8 text-center text-sm text-[var(--h-757684)]">No entries yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--h-eff4ff)] text-xs font-semibold tracking-wide text-[var(--h-757684)]">
                <tr><th className="px-6 py-3">Week</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Hours</th><th className="px-6 py-3">Submitted</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--h-c4c5d5-50)]">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--h-eff4ff)]">
                    <td className="px-6 py-3 font-semibold text-[var(--h-0b1c30)]">Week {e.weekNumber}</td>
                    <td className="px-4 py-3 text-[var(--h-444653)]">{fmt(e.periodStart)} – {fmt(e.periodEnd)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[e.status] ?? 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]'}`}>{statusLabel(e.status)}</span></td>
                    <td className="px-4 py-3 text-[var(--h-444653)]">{e.hoursLogged ?? '—'}</td>
                    <td className="px-6 py-3 text-[var(--h-757684)]">{fmt(e.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Feedback */}
        <div className="overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)]">
          <div className="border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] px-6 py-4"><h3 className="flex items-center gap-1.5 text-lg font-semibold text-[var(--h-15157d)]"><MessageSquare className="h-4 w-4" /> Supervisor feedback</h3></div>
          <div className="space-y-4 p-6">
            {feedback.length === 0 ? <p className="text-sm text-[var(--h-757684)]">No feedback yet.</p> : feedback.map((f, i) => (
              <div key={i} className="border-l-2 border-[var(--h-c4c5d5-60)] pl-4">
                <p className="text-xs font-semibold text-[var(--h-757684)]">Week {f.week} · {f.by} · {fmt(f.createdAt)}</p>
                <p className="mt-1 text-sm text-[var(--h-0b1c30)]">"{f.comment}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Supervisor history */}
        <div className="overflow-hidden rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)]">
          <div className="border-b border-[var(--h-c4c5d5-60)] bg-[var(--h-f8f9ff)] px-6 py-4"><h3 className="text-lg font-semibold text-[var(--h-15157d)]">Supervisor history</h3></div>
          <div className="space-y-4 p-6">
            {supervisorHistory.length === 0 ? <p className="text-sm text-[var(--h-757684)]">No assignment changes recorded.</p> : supervisorHistory.map((h, i) => (
              <div key={i} className="border-l-2 border-[var(--h-c4c5d5-60)] pl-4">
                <p className="text-sm text-[var(--h-0b1c30)]"><span className="font-semibold capitalize">{h.kind}</span> supervisor assigned</p>
                <p className="text-xs text-[var(--h-757684)]">by {h.by} · {fmt(h.at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

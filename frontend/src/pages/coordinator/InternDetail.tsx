import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertCircle, Mail, Building2, CalendarDays, GraduationCap, MessageSquare, Shield, Flag,
} from 'lucide-react';
import { useInternDetail } from '@/hooks/useDashboard';
import { GradePanel } from '@/components/grades/GradePanel';
import { WeeklyLinkPanel } from '@/components/industry/WeeklyLinkPanel';
import { SiwesCalendarPanel } from '@/components/shared/SiwesCalendarPanel';

const STATUS_CLS: Record<string, string> = {
  submitted:    'bg-brand-soft text-brand-ink',
  acknowledged: 'bg-ok-soft text-ok',
  returned:     'bg-danger-soft text-danger',
  draft:        'bg-warn-soft text-warn',
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
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-ink" /></div>;
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-ink-secondary">Couldn't load this intern.</p>
        <button onClick={() => refetch()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Try again</button>
      </div>
    );
  }

  const { student, placement, supervisors, progress, avgQuality, entries, riskHistory, feedback, supervisorHistory } = data;
  const card = 'rounded-xl border border-line bg-surface p-5';

  return (
    <div className="p-6">
      <Link to="/coordinator/interns" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
        <ArrowLeft className="h-4 w-4" /> All interns
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-lg font-bold text-brand-ink">
            {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">{student.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{student.email}</span>
              {student.department && <span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{student.department}</span>}
              {placement.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{placement.company}</span>}
              {placement.cohort && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{placement.cohort}</span>}
            </div>
          </div>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold capitalize text-brand-ink">{placement.status}</span>
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
          <p className="text-xs font-semibold tracking-wide text-ink-muted">Logbook progress</p>
          {/* Against the weeks due so far — the programme length is context,
              not the denominator. */}
          <p className="mt-2 text-3xl font-bold text-ink">{progress.submittedWeeks}<span className="text-lg text-ink-muted"> / {progress.weeksDue} weeks due</span></p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-soft">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, progress.progressPct ?? 0))}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">Week {progress.weeksDue} of {progress.programmeWeeks}</p>
          <p className="mt-3 text-xs text-ink-muted">Avg quality score: <span className="font-bold text-ink">{avgQuality != null ? avgQuality.toFixed(1) : '—'}</span></p>
        </div>

        {/* Supervisors */}
        <div className={card}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted">Supervisors</p>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Academic</p>
              {supervisors.academic ? (
                <><p className="text-sm font-bold text-ink">{supervisors.academic.name}</p><p className="text-xs text-ink-muted">{supervisors.academic.email}</p></>
              ) : <p className="text-sm text-ink-muted">Unassigned</p>}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Company</p>
              {supervisors.company ? (
                <><p className="text-sm font-bold text-ink">{supervisors.company.name}</p><p className="text-xs text-ink-muted">{supervisors.company.email}</p></>
              ) : <p className="text-sm text-ink-muted">Unassigned</p>}
            </div>
          </div>
        </div>

        {/* Risk history */}
        <div className={card}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-muted"><Shield className="h-3.5 w-3.5" /> Risk history</p>
          {riskHistory.length === 0 ? <p className="text-sm text-ink-muted">No risk scores yet.</p> : (
            <ul className="space-y-2">
              {riskHistory.slice(0, 5).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${RISK_CLS[r.tier]}`}>{r.tier} · {r.score.toFixed(2)}</span>
                  <span className="text-xs text-ink-muted">{fmt(r.computedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Logs */}
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line bg-surface-sunken px-6 py-4"><h3 className="text-lg font-semibold text-brand-ink">Logbook entries</h3></div>
        {entries.length === 0 ? <p className="px-6 py-8 text-center text-sm text-ink-muted">No entries yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-brand-soft text-xs font-semibold tracking-wide text-ink-muted">
                <tr><th className="px-6 py-3">Week</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Hours</th><th className="px-6 py-3">Submitted</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-brand-soft">
                    <td className="px-6 py-3 font-semibold text-ink">Week {e.weekNumber}</td>
                    <td className="px-4 py-3 text-ink-secondary">{fmt(e.periodStart)} – {fmt(e.periodEnd)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[e.status] ?? 'bg-surface-sunken text-ink-secondary'}`}>{statusLabel(e.status)}</span></td>
                    <td className="px-4 py-3 text-ink-secondary">{e.hoursLogged ?? '—'}</td>
                    <td className="px-6 py-3 text-ink-muted">{fmt(e.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Final grade */}
      {placementId && <div className="mt-4"><GradePanel placementId={placementId} /></div>}

      {/* Weekly comment link — issue/email the industry supervisor a formative-comment link */}
      {placementId && <div className="mt-4"><WeeklyLinkPanel placementId={placementId} totalWeeks={progress.programmeWeeks} /></div>}

      {/* SIWES daily logbook — read-only chain-aware calendar (coordinator oversight) */}
      {placementId && <div className="mt-4"><SiwesCalendarPanel placementId={placementId} /></div>}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Feedback */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line bg-surface-sunken px-6 py-4"><h3 className="flex items-center gap-1.5 text-lg font-semibold text-brand-ink"><MessageSquare className="h-4 w-4" /> Supervisor feedback</h3></div>
          <div className="space-y-4 p-6">
            {feedback.length === 0 ? <p className="text-sm text-ink-muted">No feedback yet.</p> : feedback.map((f, i) => (
              <div key={i} className="border-l-2 border-line pl-4">
                <p className="text-xs font-semibold text-ink-muted">Week {f.week} · {f.by} · {fmt(f.createdAt)}</p>
                <p className="mt-1 text-sm text-ink">"{f.comment}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Supervisor history */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line bg-surface-sunken px-6 py-4"><h3 className="text-lg font-semibold text-brand-ink">Supervisor history</h3></div>
          <div className="space-y-4 p-6">
            {supervisorHistory.length === 0 ? <p className="text-sm text-ink-muted">No assignment changes recorded.</p> : supervisorHistory.map((h, i) => (
              <div key={i} className="border-l-2 border-line pl-4">
                <p className="text-sm text-ink"><span className="font-semibold capitalize">{h.kind}</span> supervisor assigned</p>
                <p className="text-xs text-ink-muted">by {h.by} · {fmt(h.at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

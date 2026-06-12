import { useState } from 'react';
import { Loader2, AlertTriangle, ShieldCheck, Clock, TrendingDown, MessageSquareOff } from 'lucide-react';
import { useOversight, type OversightRow } from '@/hooks/useOversight';

function timeAgo(iso: string | null): string {
  if (!iso) return 'No activity';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

const RISK_CLS: Record<string, string> = {
  low:    'bg-[#e9f9ef] text-[#1b7a45]',
  medium: 'bg-[#fff4e0] text-[#9a6700]',
  high:   'bg-[#fde7e7] text-[#8a1c1c]',
};

function FlagPills({ row }: { row: OversightRow }) {
  const { flags } = row;
  if (!row.atRisk) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1b7a45]">
        <ShieldCheck className="h-3.5 w-3.5" /> On track
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.overdueLogs > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e0] px-2 py-0.5 text-xs font-semibold text-[#9a6700]">
          <Clock className="h-3 w-3" /> {flags.overdueLogs} overdue
        </span>
      )}
      {flags.lowAvgScore && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#fde7e7] px-2 py-0.5 text-xs font-semibold text-[#8a1c1c]">
          <TrendingDown className="h-3 w-3" /> Low score
        </span>
      )}
      {flags.noSupervisorFeedback && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef1ff] px-2 py-0.5 text-xs font-semibold text-[#15157d]">
          <MessageSquareOff className="h-3 w-3" /> No feedback
        </span>
      )}
    </div>
  );
}

/**
 * Intern Oversight — cross-cohort, read-only at-risk monitoring for
 * coordinators/admins. No actions: every cell is informational.
 */
export default function Oversight() {
  const { data, isLoading, isError } = useOversight();
  const [riskOnly, setRiskOnly] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#15157d]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-center gap-3 rounded-xl bg-[#fde7e7] p-6 text-[#8a1c1c]">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Couldn't load the oversight view. Try again.</p>
        </div>
      </div>
    );
  }

  const rows = riskOnly ? data.rows.filter((r) => r.atRisk) : data.rows;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0b1c30]">Intern Oversight</h1>
          <p className="mt-1 text-sm text-[#757684]">
            Cross-cohort monitoring · {data.summary.total} active{' '}
            {data.summary.total === 1 ? 'intern' : 'interns'} ·{' '}
            <span className={data.summary.atRisk > 0 ? 'font-semibold text-[#8a1c1c]' : ''}>
              {data.summary.atRisk} at risk
            </span>
          </p>
        </div>
        <button
          onClick={() => setRiskOnly((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            riskOnly
              ? 'border-[#15157d] bg-[#15157d] text-white'
              : 'border-[#c4c5d5] bg-white text-[#444653] hover:border-[#15157d]'
          }`}
        >
          At-risk only
        </button>
      </header>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#eef1ff] text-xs font-semibold uppercase tracking-wide text-[#757684]">
              <th className="px-5 py-3">Intern</th>
              <th className="px-5 py-3">Supervisor</th>
              <th className="px-5 py-3">Risk</th>
              <th className="px-5 py-3">Avg score</th>
              <th className="px-5 py-3">Last activity</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#757684]">
                  {riskOnly ? 'No interns are currently flagged at risk.' : 'No active interns.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.placementId}
                  className={`border-b border-[#f3f3f7] last:border-0 ${r.atRisk ? 'bg-[#fffaf5]' : ''}`}
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-[#0b1c30]">
                      {r.student.firstName} {r.student.lastName}
                    </p>
                    <p className="text-xs text-[#757684]">{r.department ?? r.student.email}</p>
                  </td>
                  <td className="px-5 py-4 text-[#444653]">{r.supervisor?.name?.trim() ? r.supervisor.name : <span className="text-[#757684]">Unassigned</span>}</td>
                  <td className="px-5 py-4">
                    {r.riskTier ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${RISK_CLS[r.riskTier]}`}>
                        {r.riskTier}
                      </span>
                    ) : (
                      <span className="text-[#757684]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-medium text-[#0b1c30]">
                    {r.avgQualityScore != null ? `${r.avgQualityScore} / 100` : '—'}
                  </td>
                  <td className="px-5 py-4 text-[#444653]">{timeAgo(r.lastActivityAt)}</td>
                  <td className="px-5 py-4"><FlagPills row={r} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

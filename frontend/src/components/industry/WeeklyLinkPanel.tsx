import { useMemo, useState } from 'react';
import { MessageSquare, Link2, Copy, Check, Loader2, AlertCircle, Mail } from 'lucide-react';
import {
  useIndustrySupervisors,
  useIssueWeeklyLink,
  type IndustrySupervisor,
  type WeeklyLinkResult,
} from '@/hooks/useWeeklyComment';

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const card = 'rounded-card border border-line bg-surface p-5';

/**
 * Coordinator/supervisor tool: mint the week-scoped weekly-comment link for a
 * placement's industry supervisor and email it (fallback: copy the URL).
 * Backend does the token minting, hashing, week-scoping and sending.
 */
export function WeeklyLinkPanel({ placementId, totalWeeks }: { placementId: string; totalWeeks: number }) {
  const supers = useIndustrySupervisors(placementId);
  const issue  = useIssueWeeklyLink();

  const list = supers.data ?? [];
  const weeks = Math.max(1, totalWeeks || 1);

  const [supervisorId, setSupervisorId] = useState('');
  const [weekNumber, setWeekNumber] = useState<number>(weeks);
  const [result, setResult] = useState<WeeklyLinkResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Resolve the selected record (default to the only/first supervisor).
  const selected: IndustrySupervisor | undefined = useMemo(
    () => list.find((s) => s.id === supervisorId) ?? list[0],
    [list, supervisorId],
  );
  const activeId = selected?.id ?? '';
  const noEmail = !!selected && !selected.email;

  const onIssue = (send: boolean) => {
    if (!activeId) return;
    issue.mutate(
      { supervisorId: activeId, weekNumber, send },
      { onSuccess: (res) => { setResult(res); setCopied(false); } },
    );
  };
  const onCopy = () => {
    if (!result?.url) return;
    navigator.clipboard?.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={card}>
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-brand-ink" />
        <h3 className="text-sm font-bold text-ink">Weekly comment link</h3>
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Send the industry supervisor a secure single-use link to leave a formative comment on a given
        week. The student and the university supervisor can see it.
      </p>

      {issue.error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-danger-soft p-2.5 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {apiErr(issue.error)}
        </div>
      )}

      {supers.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading supervisors…
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-muted">
          No industry supervisor on record for this placement.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Supervisor */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-muted">
              Supervisor
            </label>
            {list.length === 1 ? (
              <p className="text-sm text-ink">
                <span className="font-semibold">{selected?.name}</span>
                {selected?.designation ? <span className="text-ink-muted"> · {selected.designation}</span> : null}
              </p>
            ) : (
              <select
                value={activeId}
                onChange={(e) => setSupervisorId(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.designation ? ` · ${s.designation}` : ''}{s.email ? '' : ' (no email)'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Week */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-ink-muted">
              Week
            </label>
            <select
              value={weekNumber}
              onChange={(e) => setWeekNumber(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            >
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={issue.isPending || noEmail}
              onClick={() => onIssue(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {issue.isPending && issue.variables?.send ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Email link
            </button>
            <button
              type="button"
              disabled={issue.isPending}
              onClick={() => onIssue(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-surface-sunken disabled:opacity-40"
            >
              {issue.isPending && !issue.variables?.send ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Get link
            </button>
            {noEmail && <span className="text-xs text-warn">No email on file — use “Get link”.</span>}
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-lg border border-dashed border-line p-3">
              <p className="mb-2 text-xs text-ink-muted">
                {result.emailedTo
                  ? <>Sent to <span className="font-semibold text-ok">{result.emailedTo}</span> · expires {fmtDate(result.expiresAt)}</>
                  : <>Link ready · expires {fmtDate(result.expiresAt)}</>}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly value={result.url}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface-sunken px-2.5 py-1.5 text-xs text-ink-secondary"
                />
                <button
                  type="button" onClick={onCopy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

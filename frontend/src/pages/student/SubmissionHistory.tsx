import { useState } from 'react';
import {
  ChevronRight, CheckCircle2, AlertCircle, Loader2,
  Calendar, Clock, Send, RotateCcw, XCircle, Sparkles,
} from 'lucide-react';
import { useMyPlacements } from '@/hooks/usePlacements';
import { useEntries, useEntry, type EntryStatus } from '@/hooks/useEntries';

// ── Status pill — mirrors the light language of the Logbook editor ──
const STATUS_META: Record<EntryStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  draft:        { label: 'Draft',        cls: 'bg-[#fff4e0] text-[#9a6700] border-[#f3d690]', Icon: Clock },
  submitted:    { label: 'Submitted',    cls: 'bg-[#e1e8ff] text-[#15157d] border-[#bcc8ff]', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-[#ffe2dc] text-[#b3261e] border-[#f5b8ad]', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[#dcf5e6] text-[#1b7a45] border-[#aee3c2]', Icon: CheckCircle2 },
  rejected:     { label: 'Rejected',     cls: 'bg-[#fde7e7] text-[#8a1c1c] border-[#f1b4b4]', Icon: XCircle },
};

// Week-chip tint per status — green = acknowledged, red = returned/rejected,
// indigo = submitted, amber = draft.
const CHIP_CLS: Record<EntryStatus, string> = {
  draft:        'border-[#f3d690] bg-[#fff4e0] text-[#9a6700]',
  submitted:    'border-[#bcc8ff] bg-[#e1e8ff] text-[#15157d]',
  returned:     'border-[#f5b8ad] bg-[#ffe2dc] text-[#b3261e]',
  acknowledged: 'border-[#aee3c2] bg-[#dcf5e6] text-[#1b7a45]',
  rejected:     'border-[#f1b4b4] bg-[#fde7e7] text-[#8a1c1c]',
};

function StatusPill({ status }: { status: EntryStatus }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

const FLOW_STEPS = ['Submitted', 'Under review', 'Decision'];

function FlowTracker({ status }: { status: EntryStatus }) {
  const reached =
    status === 'draft' ? -1 :
    status === 'submitted' ? 1 :
    2; // acknowledged / returned / rejected — a decision was made
  const flaggedDecision = status === 'returned' || status === 'rejected';

  return (
    <div className="flex items-center gap-0">
      {FLOW_STEPS.map((s, i) => {
        const done = i <= reached;
        const isDecision = i === 2;
        const decisionFlagged = isDecision && done && flaggedDecision;
        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                done
                  ? decisionFlagged
                    ? 'border-[#f5b8ad] bg-[#ffe2dc]'
                    : 'border-[#bcc8ff] bg-[#e1e8ff]'
                  : 'border-[#d8dce6] bg-[#f7f8fb]'
              }`}>
                {done && (
                  decisionFlagged
                    ? <AlertCircle className="h-3 w-3 text-[#b3261e]" />
                    : <CheckCircle2 className="h-3 w-3 text-[#15157d]" />
                )}
              </div>
              <span className="mt-1 hidden whitespace-nowrap text-[#64748b] sm:block" style={{ fontSize: 9 }}>{s}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && (
              <div className={`mx-1 h-px w-10 sm:w-16 ${i < reached ? 'bg-[#15157d]' : 'bg-[#d8dce6]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRange(startISO: string, endISO: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  const s = new Date(`${startISO.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
  const e = new Date(`${endISO.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, year: 'numeric', timeZone: 'UTC' });
  return `${s} – ${e}`;
}

// Expanded detail — lazily fetches the full entry for the supervisor's note + AI summary.
function EntryDetail({ entryId, status }: { entryId: string; status: EntryStatus }) {
  const { data: detail, isLoading } = useEntry(entryId);

  const decisionEvent = detail?.events
    ? [...detail.events].reverse().find((e) => ['acknowledged', 'returned', 'rejected'].includes(e.toStatus))
    : undefined;
  const aiSummary = detail?.assessments?.find((a) => a.summary != null)?.summary;
  const summaryText = typeof aiSummary === 'string' ? aiSummary : null;

  return (
    <div className="border-t border-[#eef0f5] px-5 pb-5 pt-5">
      <div className="mb-4 flex items-center justify-center">
        <FlowTracker status={status} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-[#8a4cfc]" /></div>
      ) : (
        <>
          {decisionEvent?.comment && (
            <div className="mb-3 rounded-lg border border-[#e2e6ef] bg-[#fbfcfe] px-4 py-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Supervisor note</p>
              <p className="text-xs leading-relaxed text-[#464652]">"{decisionEvent.comment}"</p>
            </div>
          )}
          {summaryText && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#e2e6ef] bg-[#fbfcfe] px-4 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#8a4cfc]" />
              <p className="text-xs leading-relaxed text-[#464652]">{summaryText}</p>
            </div>
          )}
          <a
            href="/student/logbook"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#712ae2] transition-colors hover:text-[#5a1fc0]"
          >
            Open in logbook <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </>
      )}
    </div>
  );
}

export default function SubmissionHistory() {
  const { data: placements, isLoading: placementsLoading } = useMyPlacements();
  const activePlacement = placements?.find((p) => p.placementStatus === 'active') ?? placements?.[0];
  const { data: entries = [], isLoading: entriesLoading } = useEntries(activePlacement?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (placementsLoading || entriesLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
      </div>
    );
  }

  const sorted    = [...entries].sort((a, b) => b.weekNumber - a.weekNumber);
  const submitted = entries.filter((e) => e.submittedAt != null);
  const flagged   = entries.filter((e) => e.status === 'returned' || e.status === 'rejected');
  const TOTAL_WEEKS = 6; // fixed 6-week programme
  const progress  = Math.min(100, Math.round((submitted.length / TOTAL_WEEKS) * 100));

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0b1c30]">Submission History</h1>
        <p className="mt-0.5 text-sm text-[#464652]">
          {activePlacement?.company?.name ?? 'Your placement'} · {submitted.length} submitted
          {flagged.length > 0 && ` · ${flagged.length} need attention`}
        </p>
      </div>

      {/* Programme progress */}
      <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0b1c30]">Programme Progress</span>
          <span className="font-mono text-sm text-[#15157d]">{submitted.length} / {TOTAL_WEEKS} weeks</span>
        </div>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[#eef0f5]">
          <div className="h-2 rounded-full bg-[#15157d] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-[#64748b]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#1b7a45]" />Submitted ({submitted.length})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#b3261e]" />Needs attention ({flagged.length})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#cbd2e0]" />Remaining ({Math.max(0, TOTAL_WEEKS - submitted.length)})</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8dce6] bg-white py-14 text-center">
          <Calendar className="mx-auto mb-3 h-9 w-9 text-[#cbd2e0]" />
          <p className="text-sm font-medium text-[#0b1c30]">No submissions yet</p>
          <p className="mt-1 text-xs text-[#64748b]">
            Your weekly entries will appear here as you log and submit them.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((e) => {
            const isOpen  = selectedId === e.id;
            const status  = e.status;

            return (
              <div
                key={e.id}
                className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                  isOpen ? 'border-[#bcc8ff]' : 'border-[#e2e6ef]'
                }`}
              >
                <button
                  onClick={() => setSelectedId(isOpen ? null : e.id)}
                  className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#f8f9ff]"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${CHIP_CLS[status]}`}>
                    <span className="font-mono text-xs font-bold">W{e.weekNumber}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#0b1c30]">Week {e.weekNumber}</span>
                      <StatusPill status={status} />
                    </div>
                    <span className="text-xs text-[#64748b]">
                      {e.submittedAt
                        ? `Submitted ${fmtDate(e.submittedAt)}`
                        : `${fmtRange(e.periodStart, e.periodEnd)} · not submitted`}
                    </span>
                  </div>

                  <ChevronRight className={`h-4 w-4 shrink-0 text-[#94a3b8] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>

                {isOpen && <EntryDetail entryId={e.id} status={status} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Clock, Send, RotateCcw, CheckCircle2, XCircle, ArrowRight,
} from 'lucide-react';
import { useEntries, type EntryStatus } from '@/hooks/useEntries';
import { buildSchedule, fmtRange } from '@/lib/schedule';

type WeekStatus = EntryStatus | 'not_started';

const STATUS_META: Record<WeekStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-[var(--h-eef0f5)] text-[var(--h-64748b)] border-[var(--h-d8dce6)]', Icon: Calendar },
  draft:        { label: 'Draft',        cls: 'bg-[var(--h-fff4e0)] text-[var(--h-9a6700)] border-[var(--h-f3d690)]', Icon: Clock },
  submitted:    { label: 'Submitted',    cls: 'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)] border-[var(--h-bcc8ff)]', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-[var(--h-ffe2dc)] text-[var(--h-b3261e)] border-[var(--h-f5b8ad)]', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)] border-[var(--h-aee3c2)]', Icon: CheckCircle2 },
  rejected:     { label: 'Rejected',     cls: 'bg-[var(--h-fde7e7)] text-[var(--h-8a1c1c)] border-[var(--h-f1b4b4)]', Icon: XCircle },
};

function StatusPill({ status }: { status: WeekStatus }) {
  const { label, cls, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function fmtHours(h: string | number | null): string {
  if (h == null) return '—';
  const n = typeof h === 'string' ? Number(h) : h;
  if (!Number.isFinite(n)) return '—';
  return `${n} h`;
}

interface WeeklyLogbookTableProps {
  placementId: string;
  startDate: string | null;
}

export function WeeklyLogbookTable({ placementId, startDate }: WeeklyLogbookTableProps) {
  const { data: entries = [] } = useEntries(placementId);

  const schedule = useMemo(() => buildSchedule(startDate), [startDate]);
  const entryByWeek = useMemo(() => {
    const m = new Map<number, (typeof entries)[number]>();
    entries.forEach((e) => m.set(e.weekNumber, e));
    return m;
  }, [entries]);

  return (
    <div className="rounded-xl bg-[var(--h-ffffff)] p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-[var(--h-191c1e)]">Weekly Logbook</h3>
          <p className="text-sm text-[var(--h-424654)]">Each week of your placement at a glance</p>
        </div>
        <Link
          to="/student/logbook"
          className="flex shrink-0 items-center gap-2 text-sm font-bold text-[var(--h-15157d)] hover:underline"
        >
          Open logbook <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {schedule.length === 0 ? (
        <div className="rounded-xl bg-[var(--h-f3f3f7)] p-8 text-center">
          <Calendar className="mx-auto mb-3 h-8 w-8 text-[var(--h-15157d)]" />
          <p className="text-sm font-semibold text-[var(--h-191c1e)]">Your logbook hasn't opened yet</p>
          <p className="mt-1 text-sm text-[var(--h-424654)]">
            Week 1 opens on your placement start date.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--h-e2e6ef)] text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">
                <th className="px-3 py-2.5">Week</th>
                <th className="px-3 py-2.5">Period</th>
                <th className="px-3 py-2.5">Hours</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {[...schedule].reverse().map((w) => {
                const entry = entryByWeek.get(w.weekNumber);
                const status: WeekStatus = entry?.status ?? 'not_started';
                return (
                  <tr
                    key={w.weekNumber}
                    className="border-b border-[var(--h-f0f2f7)] transition-colors last:border-0 hover:bg-[var(--h-f8f9ff)]"
                  >
                    <td className="px-3 py-3 font-semibold text-[var(--h-191c1e)]">Week {w.label}</td>
                    <td className="px-3 py-3 text-[var(--h-424654)]">{fmtRange(w.periodStart, w.periodEnd)}</td>
                    <td className="px-3 py-3 text-[var(--h-424654)]">{fmtHours(entry?.hoursLogged ?? null)}</td>
                    <td className="px-3 py-3"><StatusPill status={status} /></td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to="/student/logbook"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--h-15157d)] hover:underline"
                      >
                        {status === 'not_started' || status === 'draft' || status === 'returned' ? 'Edit' : 'View'}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

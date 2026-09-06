import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Clock, Send, RotateCcw, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { useEntries, type EntryStatus } from '@/hooks/useEntries';
import { useSiwesCalendar } from '@/hooks/useSiwes';
import { buildSchedule, fmtRange } from '@/lib/schedule';

type WeekStatus = EntryStatus | 'not_started' | 'upcoming';

const STATUS_META: Record<WeekStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:  { label: 'Not started',  cls: 'bg-surface-sunken text-ink-secondary border-line', Icon: Calendar },
  upcoming:     { label: 'Upcoming',     cls: 'bg-surface-sunken text-ink-muted border-line', Icon: Clock },
  draft:        { label: 'Draft',        cls: 'bg-warn-soft text-warn border-warn', Icon: Clock },
  submitted:    { label: 'Submitted',    cls: 'bg-brand-soft text-brand-ink border-brand', Icon: Send },
  returned:     { label: 'Returned',     cls: 'bg-danger-soft text-danger border-danger', Icon: RotateCcw },
  acknowledged: { label: 'Acknowledged', cls: 'bg-ok-soft text-ok border-ok', Icon: CheckCircle2 },
};

function StatusPill({ status }: { status: WeekStatus }) {
  // Tolerate an unknown/stale status (e.g. a legacy value still in flight) —
  // fall back to the neutral pill rather than crashing the page.
  const { label, cls, Icon } = STATUS_META[status] ?? STATUS_META.not_started;
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

  // The cohort's real length, not a literal: this table sits next to a logbook
  // that renders every configured week, and the two must agree.
  const { data: calendar } = useSiwesCalendar(placementId);
  const schedule = useMemo(
    () => buildSchedule(startDate, calendar?.totalWeeks),
    [startDate, calendar?.totalWeeks],
  );
  const entryByWeek = useMemo(() => {
    const m = new Map<number, (typeof entries)[number]>();
    entries.forEach((e) => m.set(e.weekNumber, e));
    return m;
  }, [entries]);

  return (
    <div className="rounded-xl bg-surface p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-ink">Weekly Logbook</h3>
          <p className="text-sm text-ink-secondary">Each week of your placement at a glance</p>
        </div>
        <Link
          to="/student/logbook"
          className="flex shrink-0 items-center gap-2 text-sm font-bold text-brand-ink hover:underline"
        >
          Open logbook <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {schedule.length === 0 ? (
        <div className="rounded-xl bg-surface-sunken p-8 text-center">
          <Calendar className="mx-auto mb-3 h-8 w-8 text-brand-ink" />
          <p className="text-sm font-semibold text-ink">Your logbook hasn't opened yet</p>
          <p className="mt-1 text-sm text-ink-secondary">
            Week 1 opens on your placement start date.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-semibold text-ink-secondary">
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
                const status: WeekStatus = entry?.status ?? (w.upcoming ? 'upcoming' : 'not_started');
                return (
                  <tr
                    key={w.weekNumber}
                    className="border-b border-line transition-colors last:border-0 hover:bg-surface-sunken"
                  >
                    <td className="px-3 py-3 font-semibold text-ink">Week {w.label}</td>
                    <td className="px-3 py-3 text-ink-secondary">{fmtRange(w.periodStart, w.periodEnd)}</td>
                    <td className="px-3 py-3 text-ink-secondary">{fmtHours(entry?.hoursLogged ?? null)}</td>
                    <td className="px-3 py-3"><StatusPill status={status} /></td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to={`/student/logbook?week=${w.weekNumber}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
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

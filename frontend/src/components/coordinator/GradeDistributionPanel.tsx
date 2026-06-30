import { Award, Loader2 } from 'lucide-react';
import { useCohortStats, type CohortGradeStats } from '@/hooks/useGrade';

// Classification bands mirror the backend (grades.service BAND_MIN), grounded in
// the finalization `recommendation` enum. Thresholds are shown so the cutoff is
// never hidden.
const BANDS: { key: keyof CohortGradeStats['bands']; label: string; range: string; dot: string }[] = [
  { key: 'distinction', label: 'Distinction', range: '≥70', dot: 'bg-[var(--h-1b7a45)]' },
  { key: 'pass',        label: 'Pass',        range: '50–69', dot: 'bg-[var(--h-15157d)]' },
  { key: 'resit',       label: 'Resit',       range: '40–49', dot: 'bg-[var(--h-9a6700)]' },
  { key: 'fail',        label: 'Fail',        range: '<40', dot: 'bg-[var(--h-b3261e)]' },
];

function fmt(n: number | null): string {
  return n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100);
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--h-757684)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--h-0b1c30)]">
        {value}{suffix && <span className="text-sm font-normal text-[var(--h-757684)]">{suffix}</span>}
      </p>
    </div>
  );
}

/** Released-grade distribution + summary stats for the coordinator dashboard. */
export default function GradeDistributionPanel({ academicYearId }: { academicYearId: string | undefined }) {
  const { data: stats, isLoading, isError } = useCohortStats(academicYearId);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--h-15157d)]">
            <Award className="h-5 w-5" /> Grade Distribution
          </h3>
          <p className="text-xs text-[var(--h-757684)]">
            Released final grades{stats ? ` · ${stats.academicYear}` : ''}
          </p>
        </div>
        {stats && stats.count > 0 && (
          <span className="rounded-full bg-[var(--h-e5eeff)] px-2.5 py-0.5 text-xs font-semibold text-[var(--h-15157d)]">
            n = {stats.count}
          </span>
        )}
      </div>
      {children}
    </div>
  );

  if (!academicYearId || isLoading) {
    return shell(
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" />
      </div>,
    );
  }
  if (isError || !stats) {
    return shell(<p className="py-10 text-center text-sm text-[var(--h-757684)]">Couldn't load grade stats.</p>);
  }
  if (stats.count === 0) {
    return shell(
      <p className="py-10 text-center text-sm text-[var(--h-757684)]">
        No grades have been released for {stats.academicYear} yet. The distribution appears once grades are released.
      </p>,
    );
  }

  const peak = Math.max(...stats.distribution, 1);

  return shell(
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Mean" value={fmt(stats.mean)} />
        <Stat label="Median" value={fmt(stats.median)} />
        <Stat label="Pass rate" value={stats.passRate === null ? '—' : String(stats.passRate)} suffix="%" />
        <Stat label="Range" value={`${fmt(stats.min)}–${fmt(stats.max)}`} />
      </div>

      {/* 10-bucket histogram (0–100). Bar height scaled to the busiest bucket. */}
      <div className="flex h-32 items-end gap-1.5">
        {stats.distribution.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${c}`}>
            <span className="text-[10px] font-semibold text-[var(--h-444653)]">{c > 0 ? c : ''}</span>
            <div
              className="w-full rounded-t bg-[var(--h-15157d)] transition-all"
              style={{ height: `${Math.max(c > 0 ? 6 : 0, (c / peak) * 100)}%` }}
            />
            <span className="text-[9px] text-[var(--h-757684)]">{i * 10}</span>
          </div>
        ))}
      </div>

      {/* Classification bands with explicit thresholds */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--h-eef0f5)] pt-4 sm:grid-cols-4">
        {BANDS.map((b) => (
          <div key={b.key} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.dot}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--h-0b1c30)]">
                {stats.bands[b.key]} <span className="text-xs font-normal text-[var(--h-757684)]">{b.label}</span>
              </p>
              <p className="text-[10px] text-[var(--h-757684)]">{b.range}</p>
            </div>
          </div>
        ))}
      </div>
    </>,
  );
}

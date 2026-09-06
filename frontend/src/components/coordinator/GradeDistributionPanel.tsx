import { Award, Loader2 } from 'lucide-react';
import { useCohortStats, type CohortGradeStats } from '@/hooks/useGrade';

// Classification bands mirror the backend (grades.service BAND_MIN), grounded in
// the finalization `recommendation` enum. Thresholds are shown so the cutoff is
// never hidden.
const BANDS: { key: keyof CohortGradeStats['bands']; label: string; range: string; dot: string }[] = [
  { key: 'distinction', label: 'Distinction', range: '≥70', dot: 'bg-ok' },
  { key: 'pass',        label: 'Pass',        range: '50–69', dot: 'bg-brand' },
  { key: 'resit',       label: 'Resit',       range: '40–49', dot: 'bg-warn' },
  { key: 'fail',        label: 'Fail',        range: '<40', dot: 'bg-danger' },
];

function fmt(n: number | null): string {
  return n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100);
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="text-2xl font-bold text-ink">
        {value}{suffix && <span className="text-sm font-normal text-ink-muted">{suffix}</span>}
      </p>
    </div>
  );
}

/** Released-grade distribution + summary stats for the coordinator dashboard. */
export default function GradeDistributionPanel({ academicYearId }: { academicYearId: string | undefined }) {
  const { data: stats, isLoading, isError } = useCohortStats(academicYearId);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-card border border-line bg-surface p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-brand-ink">
            <Award className="h-5 w-5" /> Grade Distribution
          </h3>
          <p className="text-xs text-ink-muted">
            Released final grades{stats ? ` · ${stats.academicYear}` : ''}
          </p>
        </div>
        {stats && stats.count > 0 && (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
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
        <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
      </div>,
    );
  }
  if (isError || !stats) {
    return shell(<p className="py-10 text-center text-sm text-ink-muted">Couldn't load grade stats.</p>);
  }
  if (stats.count === 0) {
    return shell(
      <p className="py-10 text-center text-sm text-ink-muted">
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
      {/* `items-stretch` + `justify-end`: a percentage bar height only resolves
          against a parent that HAS a height. The column used to be content-sized,
          so the only thing with any height was the label text. */}
      <div className="flex h-32 items-stretch gap-1.5">
        {stats.distribution.map((c, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${c}`}>
            <span className="text-[10px] font-semibold text-ink-secondary">{c > 0 ? c : ''}</span>
            <div
              className="w-full rounded-t bg-brand transition-all"
              style={{ height: `${Math.max(c > 0 ? 6 : 0, (c / peak) * 100)}%` }}
            />
            <span className="text-[9px] text-ink-muted">{i * 10}</span>
          </div>
        ))}
      </div>

      {/* Classification bands with explicit thresholds */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 sm:grid-cols-4">
        {BANDS.map((b) => (
          <div key={b.key} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${b.dot}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {stats.bands[b.key]} <span className="text-xs font-normal text-ink-muted">{b.label}</span>
              </p>
              <p className="text-[10px] text-ink-muted">{b.range}</p>
            </div>
          </div>
        ))}
      </div>
    </>,
  );
}

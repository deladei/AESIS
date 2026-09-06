import { MapPin, Loader2 } from 'lucide-react';
import { useCohortRegions } from '@/hooks/useGrade';

// Region enum values are snake_case (e.g. greater_accra) — render Title Case.
function regionLabel(region: string | null): string {
  if (!region) return 'Unspecified';
  return region.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function passTone(rate: number): string {
  if (rate >= 80) return 'text-ok';
  if (rate >= 50) return 'text-warn';
  return 'text-danger';
}

/** Released grades rolled up by region — coordinator dashboard table. */
export default function RegionRollupPanel({ academicYearId }: { academicYearId: string | undefined }) {
  const { data, isLoading, isError } = useCohortRegions(academicYearId);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-brand-ink">
            <MapPin className="h-5 w-5" /> Grades by Region
          </h3>
          <p className="text-xs text-ink-muted">
            Released grades per region{data ? ` · ${data.academicYear}` : ''}
          </p>
        </div>
        {data && data.count > 0 && (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
            {data.regions.length} {data.regions.length === 1 ? 'region' : 'regions'}
          </span>
        )}
      </div>
      {children}
    </div>
  );

  if (!academicYearId || isLoading) {
    return shell(
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
      </div>,
    );
  }
  if (isError || !data) {
    return shell(<p className="py-8 text-center text-sm text-ink-muted">Couldn't load region rollups.</p>);
  }
  if (data.count === 0) {
    return shell(
      <p className="py-8 text-center text-sm text-ink-muted">
        No grades have been released for {data.academicYear} yet.
      </p>,
    );
  }

  return shell(
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-ink-muted">
            <th className="pb-2">Region</th>
            <th className="pb-2 text-right">Interns</th>
            <th className="pb-2 text-right">Avg</th>
            <th className="pb-2 text-right">Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {data.regions.map((r) => (
            <tr key={r.region ?? 'unspecified'} className="border-b border-line last:border-0">
              <td className="py-2.5 font-medium text-ink">{regionLabel(r.region)}</td>
              <td className="py-2.5 text-right text-ink-secondary">{r.count}</td>
              <td className="py-2.5 text-right font-semibold text-ink">{r.mean}</td>
              <td className={`py-2.5 text-right font-semibold ${passTone(r.passRate)}`}>{r.passRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[10px] text-ink-muted">Pass rate = share scoring ≥ 50.</p>
    </div>,
  );
}

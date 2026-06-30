import { MapPin, Loader2 } from 'lucide-react';
import { useCohortRegions } from '@/hooks/useGrade';

// Region enum values are snake_case (e.g. greater_accra) — render Title Case.
function regionLabel(region: string | null): string {
  if (!region) return 'Unspecified';
  return region.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function passTone(rate: number): string {
  if (rate >= 80) return 'text-[var(--h-1b7a45)]';
  if (rate >= 50) return 'text-[var(--h-9a6700)]';
  return 'text-[var(--h-b3261e)]';
}

/** Released grades rolled up by region — coordinator dashboard table. */
export default function RegionRollupPanel({ academicYearId }: { academicYearId: string | undefined }) {
  const { data, isLoading, isError } = useCohortRegions(academicYearId);

  const shell = (children: React.ReactNode) => (
    <div className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--h-15157d)]">
            <MapPin className="h-5 w-5" /> Grades by Region
          </h3>
          <p className="text-xs text-[var(--h-757684)]">
            Released grades per region{data ? ` · ${data.academicYear}` : ''}
          </p>
        </div>
        {data && data.count > 0 && (
          <span className="rounded-full bg-[var(--h-e5eeff)] px-2.5 py-0.5 text-xs font-semibold text-[var(--h-15157d)]">
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
        <Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" />
      </div>,
    );
  }
  if (isError || !data) {
    return shell(<p className="py-8 text-center text-sm text-[var(--h-757684)]">Couldn't load region rollups.</p>);
  }
  if (data.count === 0) {
    return shell(
      <p className="py-8 text-center text-sm text-[var(--h-757684)]">
        No grades have been released for {data.academicYear} yet.
      </p>,
    );
  }

  return shell(
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--h-eef0f5)] text-left text-xs font-semibold text-[var(--h-757684)]">
            <th className="pb-2">Region</th>
            <th className="pb-2 text-right">Interns</th>
            <th className="pb-2 text-right">Avg</th>
            <th className="pb-2 text-right">Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {data.regions.map((r) => (
            <tr key={r.region ?? 'unspecified'} className="border-b border-[var(--h-f5f6fa)] last:border-0">
              <td className="py-2.5 font-medium text-[var(--h-0b1c30)]">{regionLabel(r.region)}</td>
              <td className="py-2.5 text-right text-[var(--h-444653)]">{r.count}</td>
              <td className="py-2.5 text-right font-semibold text-[var(--h-0b1c30)]">{r.mean}</td>
              <td className={`py-2.5 text-right font-semibold ${passTone(r.passRate)}`}>{r.passRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[10px] text-[var(--h-757684)]">Pass rate = share scoring ≥ 50.</p>
    </div>,
  );
}

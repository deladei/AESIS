import { Link } from 'react-router-dom';
import { X, Loader2, BarChart3 } from 'lucide-react';
import { usePerformanceDistribution } from '@/hooks/useDashboard';

/**
 * Performance distribution (item 15) — the breakdown reached from the Avg
 * Performance card. Shows the spread of per-intern mean logbook quality scores
 * (validated/clamped) as a histogram, the interns below the configured
 * threshold, and how many have nothing scorable yet (never counted as 0).
 */
export default function PerformanceDistributionModal({
  scopeYearId, onClose,
}: { scopeYearId?: string; onClose: () => void }) {
  const { data, isLoading } = usePerformanceDistribution(scopeYearId);
  const maxBucket = Math.max(1, ...(data?.buckets.map((b) => b.count) ?? [1]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#15157d]" />
            <h3 className="text-lg font-bold text-[#0b1c30]">Performance distribution</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#757684] hover:bg-[#eff4ff]"><X className="h-4 w-4" /></button>
        </div>

        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#15157d]" /></div>
        ) : data.scoredCount === 0 ? (
          <p className="py-8 text-center text-sm text-[#757684]">
            No logbook scores yet{data.unscoredCount > 0 ? ` (${data.unscoredCount} intern${data.unscoredCount === 1 ? '' : 's'} awaiting their first scored entry)` : ''}.
          </p>
        ) : (
          <>
            <p className="mb-4 text-xs text-[#757684]">
              {data.scoredCount} scored intern{data.scoredCount === 1 ? '' : 's'}
              {data.unscoredCount > 0 && ` · ${data.unscoredCount} not yet scorable`}
              {data.threshold > 0 && ` · threshold ${data.threshold}/100`}
            </p>

            {/* Histogram */}
            <div className="mb-6 space-y-2">
              {data.buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-right text-xs font-medium text-[#757684]">{b.label}</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-[#eef0f5]">
                    <div className="h-full rounded bg-[#15157d]" style={{ width: `${Math.round((b.count / maxBucket) * 100)}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs font-semibold text-[#0b1c30]">{b.count}</span>
                </div>
              ))}
            </div>

            {/* Below threshold */}
            {data.threshold > 0 && (
              <div className="border-t border-[#eef1ff] pt-4">
                <h4 className="mb-2 text-sm font-semibold text-[#0b1c30]">
                  Below threshold ({data.belowThreshold.length})
                </h4>
                {data.belowThreshold.length === 0 ? (
                  <p className="text-sm text-[#1b7a45]">Every scored intern is at or above {data.threshold}/100.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.belowThreshold.map((s) => (
                      <li key={s.placementId} className="flex items-center justify-between text-sm">
                        <Link to={`/coordinator/interns/${s.placementId}`} className="font-medium text-[#15157d] hover:underline" onClick={onClose}>
                          {s.name}
                        </Link>
                        <span className="font-semibold text-[#b3261e]">{s.avg.toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

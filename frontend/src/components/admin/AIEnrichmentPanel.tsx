import { Cpu, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEnrichmentHealth, useReviveEnrichment } from '@/hooks/useDashboard';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-[var(--h-eef0f5)] px-3 py-2">
      <p className="text-xs text-[var(--h-757684)]">{label}</p>
      <p className={`text-xl font-bold ${tone ?? 'text-[var(--h-0b1c30)]'}`}>{value}</p>
    </div>
  );
}

/**
 * AI enrichment pipeline health for admins. Surfaces the queue (advisory AI
 * relevance) and lets stuck jobs be revived — the pipeline that, when it stalls,
 * leaves every AI-relevance analytic blank across the system.
 */
export default function AIEnrichmentPanel() {
  const { data, isLoading, isError } = useEnrichmentHealth();
  const revive = useReviveEnrichment();

  return (
    <section className="rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--h-0b1c30)]">
          <Cpu className="h-5 w-5 text-[var(--h-15157d)]" /> AI enrichment pipeline
        </h3>
        {data && data.revivable > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--h-fff4e0)] px-2.5 py-0.5 text-xs font-semibold text-[var(--h-9a6700)]">
            <AlertTriangle className="h-3.5 w-3.5" /> {data.revivable} stuck
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-[var(--h-757684)]">
        Advisory AI relevance is produced here. Stuck jobs (engine outage / cold start) leave AI analytics blank —
        revive them to re-run against the live engine.
      </p>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" /></div>
      ) : isError || !data ? (
        <p className="py-6 text-center text-sm text-[var(--h-757684)]">Couldn't load pipeline status.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Pending" value={data.pending} tone="text-[var(--h-9a6700)]" />
            <Stat label="Processing" value={data.processing} tone="text-[var(--h-15157d)]" />
            <Stat label="Succeeded" value={data.succeeded} tone="text-[var(--h-1b7a45)]" />
            <Stat label="Failed" value={data.failed} tone="text-[var(--h-b3261e)]" />
            <Stat label="Abandoned" value={data.abandoned} tone="text-[var(--h-b3261e)]" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => revive.mutate()}
              disabled={revive.isPending || data.revivable === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
            >
              {revive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-run failed / abandoned
            </button>
            {revive.isSuccess && revive.data && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-1b7a45)]">
                <CheckCircle2 className="h-4 w-4" /> Revived {revive.data.revived} — they re-run within ~15s.
              </span>
            )}
            {revive.isError && (
              <span className="inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]">
                <AlertTriangle className="h-4 w-4" /> Couldn't revive — try again.
              </span>
            )}
          </div>
          <p className="mt-3 text-[10px] text-[var(--h-757684)]">
            Self-heal runs automatically every 6h; this is the manual trigger. The engine cold-sleeps on idle — the
            first run after a wake may take ~30s.
          </p>
        </>
      )}
    </section>
  );
}

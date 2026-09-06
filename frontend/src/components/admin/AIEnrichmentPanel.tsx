import { Cpu, Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEnrichmentHealth, useReviveEnrichment } from '@/hooks/useDashboard';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-xl font-bold ${tone ?? 'text-ink'}`}>{value}</p>
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
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Cpu className="h-5 w-5 text-brand-ink" /> AI enrichment pipeline
        </h3>
        {data && data.revivable > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
            <AlertTriangle className="h-3.5 w-3.5" /> {data.revivable} stuck
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-ink-muted">
        Advisory AI relevance is produced here. Stuck jobs (engine outage / cold start) leave AI analytics blank —
        revive them to re-run against the live engine.
      </p>

      {isLoading ? (
        <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand-ink" /></div>
      ) : isError || !data ? (
        <p className="py-6 text-center text-sm text-ink-muted">Couldn't load pipeline status.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Pending" value={data.pending} tone="text-warn" />
            <Stat label="Processing" value={data.processing} tone="text-brand-ink" />
            <Stat label="Succeeded" value={data.succeeded} tone="text-ok" />
            <Stat label="Failed" value={data.failed} tone="text-danger" />
            <Stat label="Abandoned" value={data.abandoned} tone="text-danger" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => revive.mutate()}
              disabled={revive.isPending || data.revivable === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line-strong"
            >
              {revive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-run failed / abandoned
            </button>
            {revive.isSuccess && revive.data && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ok">
                <CheckCircle2 className="h-4 w-4" /> Revived {revive.data.revived} — they re-run within ~15s.
              </span>
            )}
            {revive.isError && (
              <span className="inline-flex items-center gap-1.5 text-sm text-danger">
                <AlertTriangle className="h-4 w-4" /> Couldn't revive — try again.
              </span>
            )}
          </div>
          <p className="mt-3 text-[10px] text-ink-muted">
            Self-heal runs automatically every 6h; this is the manual trigger. The engine cold-sleeps on idle — the
            first run after a wake may take ~30s.
          </p>
        </>
      )}
    </section>
  );
}

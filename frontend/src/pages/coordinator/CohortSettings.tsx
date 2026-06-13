import { useEffect, useState } from 'react';
import { Clock, Loader2, Check, AlertCircle, Gauge } from 'lucide-react';
import { useCohortConfig, useUpdateCohortConfig } from '@/hooks/useCohortConfig';

/**
 * Cohort Settings — coordinator configuration for the active academic year.
 * Exposes the per-week minimum attendance hours (drives the intern dashboard's
 * cumulative-hours target + shortfall flag) and the performance threshold (the
 * logbook quality score below which an intern flags as needing attention on the
 * coordinator dashboard + Oversight).
 */
export default function CohortSettings() {
  const { data: config, isLoading, isError } = useCohortConfig();
  const update = useUpdateCohortConfig();

  // Local form state, seeded once the config loads.
  const [hours, setHours] = useState<string>('');
  const [threshold, setThreshold] = useState<string>('');
  useEffect(() => {
    if (config) {
      setHours(String(config.minWeeklyHours));
      setThreshold(String(config.performanceThreshold));
    }
  }, [config?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#15157d]" />
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex items-center gap-3 rounded-xl bg-[#fde7e7] p-6 text-[#8a1c1c]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            No cohort configuration found for the active academic year.
          </p>
        </div>
      </div>
    );
  }

  const parsed   = Number(hours);
  const valid    = hours.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 168;
  const dirty    = valid && parsed !== config.minWeeklyHours;
  const expected = valid && parsed > 0 ? parsed * config.totalWeeks : 0;

  const parsedT  = Number(threshold);
  const validT   = threshold.trim() !== '' && Number.isInteger(parsedT) && parsedT >= 0 && parsedT <= 100;
  const dirtyT   = validT && parsedT !== config.performanceThreshold;

  // Which field a given mutation targeted — so the "Saved" badge only shows under
  // the section that was actually saved.
  const [savedField, setSavedField] = useState<'hours' | 'threshold' | null>(null);

  function save() {
    if (!dirty) return;
    setSavedField('hours');
    update.mutate({ minWeeklyHours: parsed });
  }
  function saveThreshold() {
    if (!dirtyT) return;
    setSavedField('threshold');
    update.mutate({ performanceThreshold: parsedT });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-bold text-[#0b1c30]">Cohort Settings</h1>
        <p className="mt-1 text-sm text-[#757684]">
          Active academic year · {config.academicYearLabel}
        </p>
      </header>

      <section className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eff4ff] text-[#15157d]">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0b1c30]">Weekly attendance minimum</h2>
            <p className="text-xs text-[#757684]">
              Drives each intern's cumulative-hours target and shortfall flag.
            </p>
          </div>
        </div>

        <label htmlFor="minWeeklyHours" className="mb-2 block text-sm font-medium text-[#444653]">
          Minimum hours per week
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <input
              id="minWeeklyHours"
              type="number"
              min={0}
              max={168}
              step={1}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-32 rounded-lg border border-[#c4c5d5] px-4 py-2.5 pr-14 text-base font-semibold text-[#0b1c30] outline-none focus:border-[#15157d] focus:ring-2 focus:ring-[#e1e0ff]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#757684]">
              h/wk
            </span>
          </div>

          <button
            onClick={save}
            disabled={!dirty || update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#15157d] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1f1fa0] disabled:cursor-not-allowed disabled:bg-[#c4c5d5]"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>

          {update.isSuccess && savedField === 'hours' && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1b7a45]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && savedField === 'hours' && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#8a1c1c]">
              <AlertCircle className="h-4 w-4" /> Couldn't save — try again
            </span>
          )}
        </div>

        {!valid && hours.trim() !== '' && (
          <p className="mt-2 text-xs font-medium text-[#8a1c1c]">
            Enter a whole number of hours between 0 and 168.
          </p>
        )}

        <p className="mt-5 border-t border-[#eef1ff] pt-4 text-sm text-[#444653]">
          {valid && parsed > 0 ? (
            <>
              Interns are expected to log{' '}
              <span className="font-semibold text-[#0b1c30]">{expected} hours</span> over the{' '}
              {config.totalWeeks}-week placement ({parsed} h/week × {config.totalWeeks} weeks).
            </>
          ) : (
            <>Set to 0 to disable the minimum — interns won't see an attendance shortfall.</>
          )}
        </p>
      </section>

      <section className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eff4ff] text-[#15157d]">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0b1c30]">Performance threshold</h2>
            <p className="text-xs text-[#757684]">
              Interns whose average logbook quality score falls below this are flagged for attention.
            </p>
          </div>
        </div>

        <label htmlFor="performanceThreshold" className="mb-2 block text-sm font-medium text-[#444653]">
          Minimum average score
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <input
              id="performanceThreshold"
              type="number"
              min={0}
              max={100}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-32 rounded-lg border border-[#c4c5d5] px-4 py-2.5 pr-14 text-base font-semibold text-[#0b1c30] outline-none focus:border-[#15157d] focus:ring-2 focus:ring-[#e1e0ff]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#757684]">
              /100
            </span>
          </div>

          <button
            onClick={saveThreshold}
            disabled={!dirtyT || update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#15157d] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1f1fa0] disabled:cursor-not-allowed disabled:bg-[#c4c5d5]"
          >
            {update.isPending && savedField === 'threshold' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>

          {update.isSuccess && savedField === 'threshold' && !dirtyT && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1b7a45]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && savedField === 'threshold' && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#8a1c1c]">
              <AlertCircle className="h-4 w-4" /> Couldn't save — try again
            </span>
          )}
        </div>

        {!validT && threshold.trim() !== '' && (
          <p className="mt-2 text-xs font-medium text-[#8a1c1c]">
            Enter a whole number between 0 and 100.
          </p>
        )}

        <p className="mt-5 border-t border-[#eef1ff] pt-4 text-sm text-[#444653]">
          {validT && parsedT > 0 ? (
            <>
              Interns averaging below{' '}
              <span className="font-semibold text-[#0b1c30]">{parsedT}/100</span> are flagged as needing
              attention on the dashboard and Oversight.
            </>
          ) : (
            <>Set to 0 to disable the low-score signal — only overdue logs, no progress, and unassigned interns flag.</>
          )}
        </p>
      </section>
    </div>
  );
}

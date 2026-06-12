import { useEffect, useState } from 'react';
import { Clock, Loader2, Check, AlertCircle } from 'lucide-react';
import { useCohortConfig, useUpdateCohortConfig } from '@/hooks/useCohortConfig';

/**
 * Cohort Settings — coordinator configuration for the active academic year.
 * Currently exposes the per-week minimum attendance hours that drives the
 * intern dashboard's cumulative-hours target + shortfall flag.
 */
export default function CohortSettings() {
  const { data: config, isLoading, isError } = useCohortConfig();
  const update = useUpdateCohortConfig();

  // Local form state, seeded once the config loads.
  const [hours, setHours] = useState<string>('');
  useEffect(() => {
    if (config) setHours(String(config.minWeeklyHours));
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

  function save() {
    if (!dirty) return;
    update.mutate({ minWeeklyHours: parsed });
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

          {update.isSuccess && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1b7a45]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && (
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
    </div>
  );
}

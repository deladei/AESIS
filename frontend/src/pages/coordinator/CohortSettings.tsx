import { useEffect, useState } from 'react';
import { Clock, Loader2, Check, AlertCircle, Gauge, Scale, Send, CheckCircle2 } from 'lucide-react';
import { useCohortConfig, useUpdateCohortConfig } from '@/hooks/useCohortConfig';
import { useReleaseCohort } from '@/hooks/useGrade';

const WEIGHT_FIELDS = [
  { key: 'weightIndustry',   label: 'Industry',   hint: 'Company supervisor' },
  { key: 'weightUniversity', label: 'University', hint: 'Academic supervisor' },
  { key: 'weightReport',     label: 'Report',     hint: 'Project report' },
  { key: 'weightLogbook',    label: 'Logbook',    hint: 'Weekly logbook' },
] as const;
type WeightKey = (typeof WEIGHT_FIELDS)[number]['key'];

/**
 * Bulk-release every signed-off (approved) grade in the cohort at once. Release
 * is terminal, so the action is two-step: a primary button reveals an explicit
 * confirm. Draft grades are skipped server-side; released grades are untouched.
 */
function BulkReleaseCard({ academicYearId, yearLabel }: { academicYearId: string; yearLabel: string }) {
  const release = useReleaseCohort();
  const [confirming, setConfirming] = useState(false);
  const result = release.data;

  return (
    <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-eff4ff)] text-[var(--h-15157d)]">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">Release all grades</h2>
          <p className="text-xs text-[var(--h-757684)]">
            Make every signed-off grade in {yearLabel} visible to its student in one step.
          </p>
        </div>
      </div>

      {!confirming ? (
        <button
          onClick={() => { setConfirming(true); release.reset(); }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Release signed-off grades
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--h-444653)]">
            Release every signed-off grade in {yearLabel}? This is final and can't be undone.
          </span>
          <button
            onClick={() => release.mutate(academicYearId, { onSuccess: () => setConfirming(false) })}
            disabled={release.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
          >
            {release.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Confirm release
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={release.isPending}
            className="rounded-lg border border-[var(--h-c4c5d5)] px-4 py-2.5 text-sm font-semibold text-[var(--h-444653)] hover:bg-[var(--h-f3f3f7)]"
          >
            Cancel
          </button>
        </div>
      )}

      {release.isSuccess && result && (
        <p className="mt-4 inline-flex items-center gap-1.5 border-t border-[var(--h-eef1ff)] pt-4 text-sm font-medium text-[var(--h-1b7a45)]">
          <CheckCircle2 className="h-4 w-4" />
          {result.released === 0
            ? 'No grades were ready to release — none had been signed off.'
            : `Released ${result.released} grade${result.released === 1 ? '' : 's'} to students.`}
        </p>
      )}
      {release.isError && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-8a1c1c)]">
          <AlertCircle className="h-4 w-4" /> Couldn't release — try again.
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--h-757684)]">
        Only grades you've already aggregated and signed off are released. Drafts are skipped, and
        already-released grades are unchanged.
      </p>
    </section>
  );
}

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
  const [weights, setWeights] = useState<Record<WeightKey, string>>({
    weightIndustry: '', weightUniversity: '', weightReport: '', weightLogbook: '',
  });
  useEffect(() => {
    if (config) {
      setHours(String(config.minWeeklyHours));
      setThreshold(String(config.performanceThreshold));
      setWeights({
        weightIndustry:   String(config.weightIndustry),
        weightUniversity: String(config.weightUniversity),
        weightReport:     String(config.weightReport),
        weightLogbook:    String(config.weightLogbook),
      });
    }
  }, [config?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }

  if (isError || !config) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--h-fde7e7)] p-6 text-[var(--h-8a1c1c)]">
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

  // Final-grade weights — validated as a set: each a whole 0–100 and the four
  // summing to exactly 100 (mirrors the backend schema).
  const parsedW = WEIGHT_FIELDS.map((f) => Number(weights[f.key]));
  const eachValidW = WEIGHT_FIELDS.every((f, i) =>
    weights[f.key].trim() !== '' && Number.isInteger(parsedW[i]) && parsedW[i] >= 0 && parsedW[i] <= 100);
  const sumW = parsedW.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const validW = eachValidW && sumW === 100;
  const dirtyW = eachValidW && WEIGHT_FIELDS.some((f, i) => parsedW[i] !== config[f.key]);

  // Which field a given mutation targeted — so the "Saved" badge only shows under
  // the section that was actually saved.
  const [savedField, setSavedField] = useState<'hours' | 'threshold' | 'weights' | null>(null);

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
  function saveWeights() {
    if (!validW || !dirtyW) return;
    setSavedField('weights');
    update.mutate({
      weightIndustry:   parsedW[0],
      weightUniversity: parsedW[1],
      weightReport:     parsedW[2],
      weightLogbook:    parsedW[3],
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Cohort Settings</h1>
        <p className="mt-1 text-sm text-[var(--h-757684)]">
          Active academic year · {config.academicYearLabel}
        </p>
      </header>

      <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-eff4ff)] text-[var(--h-15157d)]">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">Weekly attendance minimum</h2>
            <p className="text-xs text-[var(--h-757684)]">
              Drives each intern's cumulative-hours target and shortfall flag.
            </p>
          </div>
        </div>

        <label htmlFor="minWeeklyHours" className="mb-2 block text-sm font-medium text-[var(--h-444653)]">
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
              className="w-32 rounded-lg border border-[var(--h-c4c5d5)] px-4 py-2.5 pr-14 text-base font-semibold text-[var(--h-0b1c30)] outline-none focus:border-[var(--h-15157d)] focus:ring-2 focus:ring-[var(--h-e1e0ff)]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--h-757684)]">
              h/wk
            </span>
          </div>

          <button
            onClick={save}
            disabled={!dirty || update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
          >
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>

          {update.isSuccess && savedField === 'hours' && !dirty && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-1b7a45)]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && savedField === 'hours' && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-8a1c1c)]">
              <AlertCircle className="h-4 w-4" /> Couldn't save — try again
            </span>
          )}
        </div>

        {!valid && hours.trim() !== '' && (
          <p className="mt-2 text-xs font-medium text-[var(--h-8a1c1c)]">
            Enter a whole number of hours between 0 and 168.
          </p>
        )}

        <p className="mt-5 border-t border-[var(--h-eef1ff)] pt-4 text-sm text-[var(--h-444653)]">
          {valid && parsed > 0 ? (
            <>
              Interns are expected to log{' '}
              <span className="font-semibold text-[var(--h-0b1c30)]">{expected} hours</span> over the{' '}
              {config.totalWeeks}-week placement ({parsed} h/week × {config.totalWeeks} weeks).
            </>
          ) : (
            <>Set to 0 to disable the minimum — interns won't see an attendance shortfall.</>
          )}
        </p>
      </section>

      <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-eff4ff)] text-[var(--h-15157d)]">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">Performance threshold</h2>
            <p className="text-xs text-[var(--h-757684)]">
              Interns whose average logbook quality score falls below this are flagged for attention.
            </p>
          </div>
        </div>

        <label htmlFor="performanceThreshold" className="mb-2 block text-sm font-medium text-[var(--h-444653)]">
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
              className="w-32 rounded-lg border border-[var(--h-c4c5d5)] px-4 py-2.5 pr-14 text-base font-semibold text-[var(--h-0b1c30)] outline-none focus:border-[var(--h-15157d)] focus:ring-2 focus:ring-[var(--h-e1e0ff)]"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--h-757684)]">
              /100
            </span>
          </div>

          <button
            onClick={saveThreshold}
            disabled={!dirtyT || update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
          >
            {update.isPending && savedField === 'threshold' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save
          </button>

          {update.isSuccess && savedField === 'threshold' && !dirtyT && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-1b7a45)]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && savedField === 'threshold' && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-8a1c1c)]">
              <AlertCircle className="h-4 w-4" /> Couldn't save — try again
            </span>
          )}
        </div>

        {!validT && threshold.trim() !== '' && (
          <p className="mt-2 text-xs font-medium text-[var(--h-8a1c1c)]">
            Enter a whole number between 0 and 100.
          </p>
        )}

        <p className="mt-5 border-t border-[var(--h-eef1ff)] pt-4 text-sm text-[var(--h-444653)]">
          {validT && parsedT > 0 ? (
            <>
              Interns averaging below{' '}
              <span className="font-semibold text-[var(--h-0b1c30)]">{parsedT}/100</span> are flagged as needing
              attention on the dashboard and Oversight.
            </>
          ) : (
            <>Set to 0 to disable the low-score signal — only overdue logs, no progress, and unassigned interns flag.</>
          )}
        </p>
      </section>

      <section className="rounded-xl bg-[var(--h-ffffff)] p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--h-eff4ff)] text-[var(--h-15157d)]">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--h-0b1c30)]">Final-grade weights</h2>
            <p className="text-xs text-[var(--h-757684)]">
              How the four component scores combine into each intern's final grade. Must total 100.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {WEIGHT_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={f.key} className="mb-1.5 block text-sm font-medium text-[var(--h-444653)]">
                {f.label}
              </label>
              <div className="relative">
                <input
                  id={f.key}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[f.key]}
                  onChange={(e) => setWeights((w) => ({ ...w, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--h-c4c5d5)] px-4 py-2.5 pr-12 text-base font-semibold text-[var(--h-0b1c30)] outline-none focus:border-[var(--h-15157d)] focus:ring-2 focus:ring-[var(--h-e1e0ff)]"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--h-757684)]">
                  %
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--h-757684)]">{f.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-[var(--h-eef1ff)] pt-4">
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
              eachValidW && sumW === 100 ? 'text-[var(--h-1b7a45)]' : 'text-[var(--h-8a1c1c)]'
            }`}
          >
            Total: {eachValidW ? sumW : '—'}/100
          </span>

          <button
            onClick={saveWeights}
            disabled={!validW || !dirtyW || update.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:bg-[var(--h-c4c5d5)]"
          >
            {update.isPending && savedField === 'weights' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Save weights
          </button>

          {update.isSuccess && savedField === 'weights' && !dirtyW && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-1b7a45)]">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
          {update.isError && savedField === 'weights' && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-8a1c1c)]">
              <AlertCircle className="h-4 w-4" /> Couldn't save — try again
            </span>
          )}
        </div>

        {eachValidW && sumW !== 100 && (
          <p className="mt-2 text-xs font-medium text-[var(--h-8a1c1c)]">
            Weights must total exactly 100 — currently {sumW}.
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--h-757684)]">
          Applies to future aggregations. Released grades are locked; signed-off drafts pick up new
          weights the next time they're aggregated.
        </p>
      </section>

      <BulkReleaseCard academicYearId={config.academicYearId} yearLabel={config.academicYearLabel} />
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  Clock, Loader2, Check, AlertCircle, Gauge, Scale, Send, CheckCircle2,
  Download, CalendarDays, Plus, Trash2, ShieldCheck, CalendarRange,
} from 'lucide-react';
import { useCohortConfig, useUpdateCohortConfig } from '@/hooks/useCohortConfig';
import { useReleaseCohort, useCohortReport, type CohortReport } from '@/hooks/useGrade';
import { useNonWorkingDays, useCreateNonWorkingDay, useDeleteNonWorkingDay } from '@/hooks/useSiwes';
import { fmtDate } from '@/lib/schedule';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DonutStat } from '@/components/ui/Charts';
import { ErrorState, SkeletonRows } from '@/components/ui/Feedback';
import { FieldError } from '@/components/shared/FieldError';
import { boundedInt } from '@/lib/validation';
import { cn } from '@/lib/utils';

const WEIGHT_FIELDS = [
  { key: 'weightIndustry',   label: 'Industry',   hint: 'Company supervisor', color: 'var(--chart-1)' },
  { key: 'weightUniversity', label: 'University', hint: 'Academic supervisor', color: 'var(--chart-2)' },
  { key: 'weightReport',     label: 'Report',     hint: 'Project report', color: 'var(--chart-3)' },
  { key: 'weightLogbook',    label: 'Logbook',    hint: 'Weekly logbook', color: 'var(--chart-4)' },
] as const;
type WeightKey = (typeof WEIGHT_FIELDS)[number]['key'];

/* ── Section chrome ──────────────────────────────────────────── */

function Section({
  n, icon: Icon, title, hint, aside, children,
}: {
  n: number; icon: React.ElementType; title: string; hint: string;
  /** The panel beside the controls: an impact preview, a chart. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">{n}. {title}</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{hint}</p>
            </div>
          </div>
          {children}
        </div>
        {aside && <div className="lg:border-l lg:border-line lg:pl-6">{aside}</div>}
      </div>
    </Card>
  );
}

/** The tinted note beside a setting, saying what the value will actually do. */
function Impact({
  tone = 'brand', title, children,
}: { tone?: 'brand' | 'ok' | 'warn'; title: string; children: React.ReactNode }) {
  const tones = {
    brand: 'bg-brand-soft text-brand-ink',
    ok:    'bg-ok-soft text-ok',
    warn:  'bg-warn-soft text-warn',
  } as const;
  return (
    <div className={cn('rounded-lg px-4 py-3', tones[tone])}>
      <p className="text-xs font-bold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-90">{children}</p>
    </div>
  );
}

function SaveButton({
  onClick, disabled, pending, children = 'Save',
}: { onClick: () => void; disabled: boolean; pending: boolean; children?: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:bg-line-strong disabled:text-ink-muted"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {children}
    </button>
  );
}

function SaveState({ saved, failed }: { saved: boolean; failed: boolean }) {
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Check className="h-4 w-4" /> Saved
      </span>
    );
  }
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
        <AlertCircle className="h-4 w-4" /> Couldn't save — try again
      </span>
    );
  }
  return null;
}

/* ── 4. Release ──────────────────────────────────────────────── */

/**
 * Bulk-release every signed-off (approved) grade in the cohort at once. Release
 * is terminal, so the action is two-step: a primary button reveals an explicit
 * confirm. Draft grades are skipped server-side; released grades are untouched.
 */
function ReleaseSection({ academicYearId, yearLabel }: { academicYearId: string; yearLabel: string }) {
  const release = useReleaseCohort();
  const [confirming, setConfirming] = useState(false);
  const result = release.data;

  return (
    <Section
      n={4} icon={Send} title="Release of grades"
      hint={`Make every signed-off grade in ${yearLabel} visible to its student in one step.`}
      aside={
        <Impact tone="warn" title="Release is final">
          Only grades already aggregated and signed off are released. Drafts are skipped and
          already-released grades are unchanged. A released grade cannot be withdrawn.
        </Impact>
      }
    >
      {!confirming ? (
        <button
          type="button"
          onClick={() => { setConfirming(true); release.reset(); }}
          className="inline-flex items-center gap-2 rounded-lg bg-ok px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90"
        >
          <Send className="h-4 w-4" /> Release signed-off grades
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-secondary">
            Release every signed-off grade in {yearLabel}? This is final and can't be undone.
          </span>
          <button
            type="button"
            onClick={() => release.mutate(academicYearId, { onSuccess: () => setConfirming(false) })}
            disabled={release.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ok px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {release.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Confirm release
          </button>
          <button
            type="button" onClick={() => setConfirming(false)} disabled={release.isPending}
            className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-secondary hover:bg-surface-sunken"
          >
            Cancel
          </button>
        </div>
      )}

      {release.isSuccess && result && (
        <p className="mt-4 inline-flex items-center gap-1.5 border-t border-line pt-4 text-sm font-medium text-ok">
          <CheckCircle2 className="h-4 w-4" />
          {result.released === 0
            ? 'No grades were ready to release — none had been signed off.'
            : `Released ${result.released} grade${result.released === 1 ? '' : 's'} to students.`}
        </p>
      )}
      {release.isError && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="h-4 w-4" /> Couldn't release — try again.
        </p>
      )}
    </Section>
  );
}

/* ── 5. Export ───────────────────────────────────────────────── */

// CSV cell: quote when the value contains a comma, quote, or newline; double up
// embedded quotes (RFC 4180). null/undefined → empty cell.
function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const REPORT_HEADERS = [
  'Student', 'Index number', 'Company', 'Region', 'Supervisor',
  'Industry', 'University', 'Report', 'Logbook', 'Total', 'Effective total', 'Released at',
] as const;

function reportToCsv(report: CohortReport): string {
  const lines = [REPORT_HEADERS.join(',')];
  for (const r of report.rows) {
    lines.push([
      csvCell(r.studentName), csvCell(r.indexNumber), csvCell(r.company), csvCell(r.region),
      csvCell(r.supervisor), csvCell(r.industry), csvCell(r.university), csvCell(r.report),
      csvCell(r.logbook), csvCell(r.total), csvCell(r.effectiveTotal),
      csvCell(r.releasedAt ? new Date(r.releasedAt).toISOString().slice(0, 10) : null),
    ].join(','));
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Coordinator/admin — export every released grade in the year as a CSV. */
function ExportSection({ academicYearId, yearLabel }: { academicYearId: string; yearLabel: string }) {
  const report = useCohortReport();
  const [emptyNote, setEmptyNote] = useState(false);

  const onExport = () => {
    setEmptyNote(false);
    report.mutate(academicYearId, {
      onSuccess: (data) => {
        if (data.count === 0) { setEmptyNote(true); return; }
        downloadCsv(`aesis-grades-${yearLabel.replace(/\//g, '-')}.csv`, reportToCsv(data));
      },
    });
  };

  return (
    <Section
      n={5} icon={Download} title="Export released grades"
      hint={`Download every released grade in ${yearLabel} — component scores, total and release date.`}
      aside={
        <div className="rounded-lg bg-surface-sunken px-4 py-3">
          <p className="text-xs font-bold text-ink">The export includes</p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-secondary">
            {['Intern name and index number', 'Company, region and supervisor',
              'All four component scores', 'Final and effective total', 'Release date'].map(t => (
              <li key={t} className="flex items-start gap-1.5">
                <Check className="mt-px h-3.5 w-3.5 shrink-0 text-ok" /> {t}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <button
        type="button" onClick={onExport} disabled={report.isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:bg-line-strong disabled:text-ink-muted"
      >
        {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download CSV
      </button>

      {emptyNote && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
          <AlertCircle className="h-4 w-4" /> No grades have been released in {yearLabel} yet.
        </p>
      )}
      {report.isError && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="h-4 w-4" /> Couldn't build the export — try again.
        </p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Only released grades are included — drafts and signed-off-but-unreleased grades are omitted.
      </p>
    </Section>
  );
}

/* ── 6. Holidays ─────────────────────────────────────────────── */

/**
 * Holiday calendar — public holidays and other non-working days for the cohort.
 * These days are excluded from the SIWES daily-logbook attendance rules (a
 * declared holiday beats the weekday pattern, so a missing entry never flags on
 * one). Config, so rows are deletable — unlike the evidence tables.
 */
function HolidaySection({ academicYearId, yearLabel }: { academicYearId: string; yearLabel: string }) {
  const { data: days = [], isLoading } = useNonWorkingDays(academicYearId);
  const create = useCreateNonWorkingDay(academicYearId);
  const remove = useDeleteNonWorkingDay(academicYearId);
  const [day, setDay] = useState('');
  const [label, setLabel] = useState('');

  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));

  return (
    <Section
      n={6} icon={CalendarDays} title="Holiday calendar"
      hint={`Public holidays and non-working days in ${yearLabel}. A declared holiday beats the weekday pattern, so a missing entry never flags on one.`}
      aside={
        <Impact title={sorted.length === 0 ? 'No holidays declared' : `${sorted.length} day${sorted.length === 1 ? '' : 's'} declared`}>
          {sorted.length === 0
            ? 'Every working weekday currently counts toward attendance.'
            : 'Attendance rules skip these dates for every intern in the cohort.'}
        </Impact>
      }
    >
      {isLoading ? (
        <SkeletonRows rows={2} />
      ) : sorted.length === 0 ? (
        <p className="mb-4 text-sm text-ink-muted">No holidays configured for {yearLabel} yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-line">
          {sorted.map(d => (
            <li key={d.id} className="flex items-center justify-between py-2.5">
              <span className="flex items-center gap-3 text-sm">
                <span className="w-28 font-semibold text-ink">{fmtDate(d.day.slice(0, 10))}</span>
                <span className="text-ink-secondary">{d.label}</span>
              </span>
              <button
                type="button" onClick={() => remove.mutate(d.id)} disabled={remove.isPending}
                aria-label={`Remove ${d.label}`}
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-secondary">
          Date
          <input
            type="date" value={day} onChange={(e) => setDay(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-semibold text-ink-secondary">
          Holiday name
          <input
            type="text" value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Independence Day"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (!day || !label.trim()) return;
            create.mutate({ day, label: label.trim() }, {
              onSuccess: () => { setDay(''); setLabel(''); },
            });
          }}
          disabled={!day || !label.trim() || create.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-hover disabled:bg-line-strong disabled:text-ink-muted"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add holiday
        </button>
      </div>

      {(create.isError || remove.isError) && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="h-4 w-4" /> Couldn't save the change — try again.
        </p>
      )}
    </Section>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

/**
 * Cohort Settings — coordinator configuration for the active academic year:
 * attendance minimum, performance threshold, final-grade weights, grade
 * release, export and the holiday calendar.
 *
 * The design's "AI Optimization" panel is absent. There is no optimizer, and a
 * button offering to tune a cohort's grade weights with nothing behind it would
 * be worse than no button. The settings-health rail in its place is a real
 * audit of which settings are configured.
 */
export default function CohortSettings() {
  const { data: config, isLoading, isError } = useCohortConfig();
  const update = useUpdateCohortConfig();

  // Local form state, seeded once the config loads.
  const [weeks, setWeeks] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [threshold, setThreshold] = useState<string>('');
  const [weights, setWeights] = useState<Record<WeightKey, string>>({
    weightIndustry: '', weightUniversity: '', weightReport: '', weightLogbook: '',
  });
  const [savedField, setSavedField] = useState<'weeks' | 'hours' | 'threshold' | 'weights' | null>(null);

  useEffect(() => {
    if (config) {
      setWeeks(String(config.durationWeeks));
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

  if (isLoading) return <div className="p-6"><SkeletonRows rows={6} /></div>;

  if (isError || !config) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <ErrorState message="No cohort configuration found for the active academic year." />
        </Card>
      </div>
    );
  }

  // Bounds come from the shared field rules, so the inline message here is the
  // same text the API would return for the same value.
  const weeksCheck = weeks.trim() === '' ? null : boundedInt(1, 52, 'Attachment length').safeParse(Number(weeks));
  const weeksError = weeksCheck && !weeksCheck.success ? weeksCheck.error.issues[0]?.message : undefined;
  const parsedWk   = Number(weeks);
  const validWk    = weeksCheck?.success === true;
  const dirtyWk    = validWk && parsedWk !== config.durationWeeks;

  const hoursCheck = hours.trim() === '' ? null : boundedInt(0, 168, 'Minimum hours per week').safeParse(Number(hours));
  const hoursError = hoursCheck && !hoursCheck.success ? hoursCheck.error.issues[0]?.message : undefined;
  const parsed   = Number(hours);
  const valid    = hoursCheck?.success === true;
  const dirty    = valid && parsed !== config.minWeeklyHours;
  // Previewed against the length CURRENTLY IN THE BOX, so editing both at once
  // shows the total the coordinator is actually about to create.
  const previewWeeks = validWk ? parsedWk : config.durationWeeks;
  const expected = valid && parsed > 0 ? parsed * previewWeeks : 0;

  const thresholdCheck = threshold.trim() === '' ? null : boundedInt(0, 100, 'Minimum average score').safeParse(Number(threshold));
  const thresholdError = thresholdCheck && !thresholdCheck.success ? thresholdCheck.error.issues[0]?.message : undefined;
  const parsedT  = Number(threshold);
  const validT   = thresholdCheck?.success === true;
  const dirtyT   = validT && parsedT !== config.performanceThreshold;

  // Final-grade weights — validated as a set: each a whole 0–100 and the four
  // summing to exactly 100 (mirrors the backend schema).
  const parsedW = WEIGHT_FIELDS.map(f => Number(weights[f.key]));
  const weightErrors = WEIGHT_FIELDS.map((f, i) => {
    if (weights[f.key].trim() === '') return `${f.label} is required`;
    const r = boundedInt(0, 100, f.label).safeParse(parsedW[i]);
    return r.success ? undefined : r.error.issues[0]?.message;
  });
  const eachValidW = weightErrors.every(e => e === undefined);
  const sumW = parsedW.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const validW = eachValidW && sumW === 100;
  const dirtyW = eachValidW && WEIGHT_FIELDS.some((f, i) => parsedW[i] !== config[f.key]);

  const savedOK = (field: typeof savedField, stillDirty: boolean) =>
    update.isSuccess && savedField === field && !stillDirty;

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <header>
            <p className="mb-1 text-xs font-semibold text-brand-ink">Coordinator</p>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Cohort Settings</h1>
            <p className="mt-1 text-sm text-ink-secondary">
              Manage academic rules, performance settings and grading preferences · {config.academicYearLabel}
            </p>
          </header>

          {/* 1 ── attachment length */}
          <Section
            n={1} icon={CalendarRange} title="Attachment length"
            hint="How many weeks this cohort's attachment runs for. Everything else counts against it."
            aside={
              <Impact title="What this changes">
                {validWk
                  ? <>The logbook accepts weeks <strong>1&nbsp;to&nbsp;{parsedWk}</strong> and refuses week {parsedWk + 1}.
                      Every &ldquo;week X of Y&rdquo;, every progress bar and the compliance denominator
                      all read {parsedWk}.</>
                  : <>The attachment length bounds the logbook and every progress figure in the system.</>}
              </Impact>
            }
          >
            <label htmlFor="durationWeeks" className="mb-2 block text-sm font-medium text-ink-secondary">
              Weeks in the attachment
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <input
                  id="durationWeeks" type="number" min={1} max={52} step={1} value={weeks}
                  aria-invalid={!!weeksError} onChange={(e) => setWeeks(e.target.value)}
                  className="w-32 rounded-lg border border-line bg-surface px-4 py-2.5 pr-16 text-base font-semibold text-ink outline-none focus:border-brand"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-muted">weeks</span>
                <FieldError message={weeksError} />
              </div>
              <SaveButton
                onClick={() => { if (dirtyWk) { setSavedField('weeks'); update.mutate({ durationWeeks: parsedWk }); } }}
                disabled={!dirtyWk || update.isPending}
                pending={update.isPending && savedField === 'weeks'}
              />
              <SaveState saved={savedOK('weeks', dirtyWk)} failed={update.isError && savedField === 'weeks'} />
            </div>
            {validWk && parsedWk < config.durationWeeks && (
              <p className="mt-3 text-xs font-medium text-warn">
                Shortening the attachment does not delete anything. Weeks already logged beyond
                week&nbsp;{parsedWk} stay in the record — they simply stop counting toward progress.
              </p>
            )}
          </Section>

          {/* 2 ── attendance minimum */}
          <Section
            n={2} icon={Clock} title="Weekly attendance minimum"
            hint="Drives each intern's cumulative-hours target and their shortfall flag."
            aside={
              <Impact title="What this changes">
                {valid && parsed > 0
                  ? <>Interns are expected to log <strong>{expected} hours</strong> across the {previewWeeks}-week
                      placement ({parsed} h/week × {previewWeeks} weeks). Anyone below reads as short.</>
                  : <>Set to 0 to disable the minimum — interns will never see an attendance shortfall.</>}
              </Impact>
            }
          >
            <label htmlFor="minWeeklyHours" className="mb-2 block text-sm font-medium text-ink-secondary">
              Minimum hours per week
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <input
                  id="minWeeklyHours" type="number" min={0} max={168} step={1} value={hours}
                  aria-invalid={!!hoursError} onChange={(e) => setHours(e.target.value)}
                  className="w-32 rounded-lg border border-line bg-surface px-4 py-2.5 pr-14 text-base font-semibold text-ink outline-none focus:border-brand"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-muted">h/wk</span>
                <FieldError message={hoursError} />
              </div>
              <SaveButton
                onClick={() => { if (dirty) { setSavedField('hours'); update.mutate({ minWeeklyHours: parsed }); } }}
                disabled={!dirty || update.isPending}
                pending={update.isPending && savedField === 'hours'}
              />
              <SaveState saved={savedOK('hours', dirty)} failed={update.isError && savedField === 'hours'} />
            </div>
          </Section>

          {/* 3 ── performance threshold */}
          <Section
            n={3} icon={Gauge} title="Performance threshold"
            hint="Interns whose average logbook quality score falls below this are flagged for attention."
            aside={
              <Impact tone="warn" title="Impact preview">
                {validT && parsedT > 0
                  ? <>Interns averaging below <strong>{parsedT}/100</strong> appear on the dashboard and in Oversight
                      as needing support.</>
                  : <>Set to 0 to disable the low-score signal — only overdue logs, no progress and unassigned
                      interns will flag.</>}
              </Impact>
            }
          >
            <label htmlFor="performanceThreshold" className="mb-2 block text-sm font-medium text-ink-secondary">
              Minimum average score
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative">
                <input
                  id="performanceThreshold" type="number" min={0} max={100} step={1} value={threshold}
                  aria-invalid={!!thresholdError} onChange={(e) => setThreshold(e.target.value)}
                  className="w-32 rounded-lg border border-line bg-surface px-4 py-2.5 pr-14 text-base font-semibold text-ink outline-none focus:border-brand"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-muted">/100</span>
                <FieldError message={thresholdError} />
              </div>
              <SaveButton
                onClick={() => { if (dirtyT) { setSavedField('threshold'); update.mutate({ performanceThreshold: parsedT }); } }}
                disabled={!dirtyT || update.isPending}
                pending={update.isPending && savedField === 'threshold'}
              />
              <SaveState saved={savedOK('threshold', dirtyT)} failed={update.isError && savedField === 'threshold'} />
            </div>
          </Section>

          {/* 4 ── grade weights */}
          <Section
            n={4} icon={Scale} title="Final grade weights"
            hint="How the four component scores combine into each intern's final grade. Must total exactly 100."
            aside={
              <DonutStat
                data={WEIGHT_FIELDS.map((f, i) => ({
                  label: f.label,
                  value: Number.isFinite(parsedW[i]) ? parsedW[i] : 0,
                  color: f.color,
                })).filter(s => s.value > 0)}
                centerValue={eachValidW ? `${sumW}%` : '—'}
                centerCaption="Total weight"
                emptyHint="Set at least one component weight above zero."
              />
            }
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {WEIGHT_FIELDS.map((f, i) => (
                <div key={f.key}>
                  <label htmlFor={f.key} className="mb-1.5 block text-sm font-medium text-ink-secondary">
                    {f.label}
                  </label>
                  <div className="relative">
                    <input
                      id={f.key} type="number" min={0} max={100} step={1} value={weights[f.key]}
                      onChange={(e) => setWeights(w => ({ ...w, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 pr-10 text-base font-semibold text-ink outline-none focus:border-brand"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>
                  </div>
                  <FieldError message={weightErrors[i]} />
                  <p className="mt-1 text-xs text-ink-muted">{f.hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4">
              <Badge tone={validW ? 'ok' : 'danger'}>
                Total: {eachValidW ? sumW : '—'}/100
              </Badge>
              <SaveButton
                onClick={() => {
                  if (!validW || !dirtyW) return;
                  setSavedField('weights');
                  update.mutate({
                    weightIndustry:   parsedW[0], weightUniversity: parsedW[1],
                    weightReport:     parsedW[2], weightLogbook:    parsedW[3],
                  });
                }}
                disabled={!validW || !dirtyW || update.isPending}
                pending={update.isPending && savedField === 'weights'}
              >
                Save weights
              </SaveButton>
              <SaveState saved={savedOK('weights', dirtyW)} failed={update.isError && savedField === 'weights'} />
            </div>

            {eachValidW && sumW !== 100 && (
              <p className="mt-2 text-xs font-medium text-danger">
                Weights must total exactly 100 — currently {sumW}.
              </p>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Applies to future aggregations. Released grades are locked; signed-off drafts pick up new
              weights the next time they're aggregated.
            </p>
          </Section>

          <ReleaseSection academicYearId={config.academicYearId} yearLabel={config.academicYearLabel} />
          <ExportSection  academicYearId={config.academicYearId} yearLabel={config.academicYearLabel} />
          <HolidaySection academicYearId={config.academicYearId} yearLabel={config.academicYearLabel} />
        </div>

        <aside className="space-y-5">
          <SettingsHealth
            durationWeeks={config.durationWeeks}
            attendance={config.minWeeklyHours > 0}
            threshold={config.performanceThreshold > 0}
            weights={config.weightIndustry + config.weightUniversity + config.weightReport + config.weightLogbook === 100}
            academicYearId={config.academicYearId}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * An audit of what is actually configured — not a score of how good the
 * settings are, which nothing here could know. Each row is a fact: this
 * setting is on, or it is off and here is what that turns off with it.
 */
function SettingsHealth({
  durationWeeks, attendance, threshold, weights, academicYearId,
}: {
  durationWeeks: number; attendance: boolean; threshold: boolean;
  weights: boolean; academicYearId: string;
}) {
  const { data: days = [] } = useNonWorkingDays(academicYearId);

  const checks = [
    // Always on — the column is NOT NULL — so this row reports the value rather
    // than a yes/no, which would always read "yes" and tell nobody anything.
    { label: `Attachment length: ${durationWeeks} week${durationWeeks === 1 ? '' : 's'}`, on: true,
      off: 'Not configured.' },
    { label: 'Attendance minimum', on: attendance, off: 'No hours target; nobody flags as short.' },
    { label: 'Performance threshold', on: threshold, off: 'Low scores raise no signal.' },
    { label: 'Grade weights total 100', on: weights, off: 'Aggregation will refuse these weights.' },
    { label: 'Holiday calendar', on: days.length > 0, off: 'Every weekday counts toward attendance.' },
  ];
  const configured = checks.filter(c => c.on).length;

  return (
    <Card>
      <CardHeader title="Settings health" subtitle={`${configured} of ${checks.length} configured`} />
      <ul className="space-y-3">
        {checks.map(c => (
          <li key={c.label} className="flex items-start gap-2.5">
            <span className={cn(
              'mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full',
              c.on ? 'bg-ok-soft text-ok' : 'bg-surface-sunken text-ink-muted',
            )}>
              {c.on ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{c.label}</span>
              {!c.on && <span className="block text-xs text-ink-muted">{c.off}</span>}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        Each setting saves on its own, and takes effect on the next aggregation. Nothing here
        rewrites a grade that has already been released.
      </p>
    </Card>
  );
}

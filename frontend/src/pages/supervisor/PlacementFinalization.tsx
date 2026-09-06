import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, Inbox, Award, Lock, Link2, Copy, Check,
  ClipboardCheck, CalendarDays, Plus, X, Clock,
} from 'lucide-react';
import {
  useAssignedPlacements, type Placement, type FinalizationStatus,
} from '@/hooks/usePlacements';
import { ObjectivesPanel } from '@/components/objectives/ObjectivesPanel';
import { GradePanel } from '@/components/grades/GradePanel';
import { WeeklyLinkPanel } from '@/components/industry/WeeklyLinkPanel';
import { SiwesCalendarPanel } from '@/components/shared/SiwesCalendarPanel';
import { useEntries, type LogbookEntry, type EntryStatus } from '@/hooks/useEntries';
import {
  useRecordAssessment, useFinalizePlacement, useInviteAttestation,
  type AttestationInvite, type WeekWaiver,
} from '@/hooks/useFinalization';
import { freeText, optionalFreeText } from '@/lib/validation';
import { FieldError } from '@/components/shared/FieldError';

function placementName(p: Placement): string {
  const s = p.student;
  return s ? `${s.firstName} ${s.lastName}` : 'Student';
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!end) return `From ${s}`;
  const e = new Date(`${end.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${s} – ${e}`;
}

const FINAL_LABEL: Record<FinalizationStatus, string> = {
  active:             'In progress',
  assessment_pending: 'Assessment recorded',
  finalized:          'Finalized',
};
const FINAL_PILL: Record<FinalizationStatus, string> = {
  active:             'bg-surface-sunken text-ink-secondary',
  assessment_pending: 'bg-warn-soft text-warn',
  finalized:          'bg-ok-soft text-ok',
};

const WEEK_PILL: Record<EntryStatus, string> = {
  draft:        'bg-surface-sunken text-ink-secondary',
  submitted:    'bg-brand-soft text-brand-ink',
  returned:     'bg-danger-soft text-danger',
  acknowledged: 'bg-ok-soft text-ok',
};
const WEEK_LABEL: Record<EntryStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', returned: 'Returned',
  acknowledged: 'Acknowledged',
};

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

/**
 * The rules `assessmentSchema` and `finalizeSchema` parse these bodies with.
 * The page previously bounded none of them — `maxLength={20}` truncated a grade
 * as it was typed, and a narrative or waiver reason over the limit came back as
 * a bare 400 with nothing under the field that caused it.
 */
const gradeRule     = freeText(20, 'Grade');
const narrativeRule = optionalFreeText(10000, 'Narrative');
const waiverReasonRule = freeText(2000, 'Waiver reason');

/** Message for one waiver box — silent until something has been typed in it. */
function waiverError(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  const r = waiverReasonRule.safeParse(value);
  return r.success ? undefined : r.error.issues[0]?.message;
}

export default function PlacementFinalization() {
  const { data: placements = [], isLoading } = useAssignedPlacements();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (placements.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !placements.some((p) => p.id === selectedId)) {
      setSelectedId(placements[0].id);
    }
  }, [placements, selectedId]);

  const selected = placements.find((p) => p.id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-ink" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Finalize placements</h1>
        <p className="mt-0.5 text-sm text-ink-secondary">
          Record the final assessment, confirm every week is resolved, and close out the internship.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Placement list */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
              Your interns
            </div>
            {placements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto mb-2 h-7 w-7 text-ink-muted" />
                <p className="text-sm text-ink-muted">No active placements assigned to you.</p>
              </div>
            ) : (
              <div className="max-h-[68vh] overflow-y-auto">
                {placements.map((p) => {
                  const active = p.id === selectedId;
                  const fs = (p.finalizationStatus ?? 'active') as FinalizationStatus;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full border-b border-line px-4 py-3 text-left transition-colors last:border-0 ${
                        active ? 'bg-brand-soft' : 'hover:bg-surface-sunken'
                      }`}
                    >
                      <p className={`truncate text-sm font-semibold ${active ? 'text-brand-ink' : 'text-ink'}`}>
                        {placementName(p)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-ink-secondary">{p.company?.name ?? 'Placement'}</p>
                      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${FINAL_PILL[fs]}`}>
                        {FINAL_LABEL[fs]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Detail */}
        <section>
          {!selected ? (
            <div className="rounded-xl border border-dashed border-line bg-surface py-24 text-center">
              <Award className="mx-auto mb-3 h-10 w-10 text-ink-muted" />
              <h2 className="text-base font-semibold text-ink">Nothing to finalize</h2>
              <p className="mt-1 text-sm text-ink-secondary">Your assigned placements will appear here.</p>
            </div>
          ) : (
            <FinalizationDetail key={selected.id} placement={selected} />
          )}
        </section>
      </div>
    </div>
  );
}

function FinalizationDetail({ placement }: { placement: Placement }) {
  const fs = (placement.finalizationStatus ?? 'active') as FinalizationStatus;
  const isFinalized = fs === 'finalized';
  const hasAssessment = fs !== 'active';

  const { data: entries = [], isLoading: entriesLoading } = useEntries(placement.id);
  const recordAssessment = useRecordAssessment();
  const finalize = useFinalizePlacement();
  const invite = useInviteAttestation();

  const [grade, setGrade] = useState('');
  const [narrative, setNarrative] = useState('');
  const [criteria, setCriteria] = useState<{ criterion: string; rating: number }[]>([]);
  const [recommendation, setRecommendation] = useState<'' | 'pass' | 'distinction' | 'resit' | 'fail'>('');
  const [assessMsg, setAssessMsg] = useState<string | null>(null);
  const [assessErr, setAssessErr] = useState<string | null>(null);

  const gradeCheck = grade.trim() === '' ? null : gradeRule.safeParse(grade);
  const gradeError = gradeCheck && !gradeCheck.success ? gradeCheck.error.issues[0]?.message : undefined;
  const narrativeCheck = narrativeRule.safeParse(narrative);
  const narrativeError = narrative.trim() !== '' && !narrativeCheck.success
    ? narrativeCheck.error.issues[0]?.message
    : undefined;

  const [waivers, setWaivers] = useState<Record<number, string>>({});
  const [finalizeErr, setFinalizeErr] = useState<string | null>(null);

  const [inviteData, setInviteData] = useState<AttestationInvite | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.weekNumber - b.weekNumber),
    [entries],
  );
  const unresolved = useMemo(
    () => sortedEntries.filter((e) => e.status !== 'acknowledged'),
    [sortedEntries],
  );
  const allWaived = unresolved.every((e) => (waivers[e.weekNumber] ?? '').trim().length > 0);

  const handleRecord = async () => {
    setAssessErr(null); setAssessMsg(null);
    if (!gradeCheck?.success) {
      setAssessErr(gradeError ?? 'A grade is required.'); return;
    }
    if (!narrativeCheck.success) {
      setAssessErr(narrativeCheck.error.issues[0]?.message ?? null); return;
    }
    const validCriteria = criteria
      .filter((c) => c.criterion.trim())
      .map((c) => ({ criterion: c.criterion.trim(), rating: c.rating }));
    const evaluation =
      validCriteria.length > 0 || recommendation
        ? { criteria: validCriteria, ...(recommendation ? { recommendation } : {}) }
        : undefined;
    try {
      await recordAssessment.mutateAsync({
        placementId: placement.id,
        grade: gradeCheck.data,
        narrative: narrativeCheck.data,
        evaluation,
      });
      setAssessMsg('Assessment recorded. You can now finalize once every week is resolved.');
    } catch (e) { setAssessErr(apiErr(e)); }
  };

  const handleInvite = async () => {
    setInviteErr(null); setCopied(false);
    try {
      const data = await invite.mutateAsync(placement.id);
      setInviteData(data);
    } catch (e) { setInviteErr(apiErr(e)); }
  };

  const handleCopy = async () => {
    if (!inviteData) return;
    try {
      await navigator.clipboard.writeText(inviteData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — user can select the text manually */ }
  };

  const handleFinalize = async () => {
    setFinalizeErr(null);
    const payload: WeekWaiver[] = unresolved.map((e) => ({
      weekNumber: e.weekNumber,
      reason: (waivers[e.weekNumber] ?? '').trim(),
    }));
    const bad = payload.find((w) => !waiverReasonRule.safeParse(w.reason).success);
    if (bad) {
      const issue = waiverReasonRule.safeParse(bad.reason);
      setFinalizeErr(
        bad.reason === ''
          ? 'Every unacknowledged week needs a waiver reason before you can finalize.'
          : `Week ${bad.weekNumber}: ${issue.success ? '' : issue.error.issues[0]?.message}`,
      );
      return;
    }
    try {
      await finalize.mutateAsync({ placementId: placement.id, waivers: payload });
      // The list refetches (finalizationStatus → finalized); this view re-renders locked.
    } catch (e) { setFinalizeErr(apiErr(e)); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-ink">{placementName(placement)}</h2>
            <p className="text-sm text-ink-secondary">{placement.company?.name ?? '—'}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-secondary">
              <CalendarDays className="h-3 w-3" /> {fmtRange(placement.startDate, placement.endDate)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${FINAL_PILL[fs]}`}>
            {FINAL_LABEL[fs]}
          </span>
        </div>
      </div>

      {isFinalized && (
        <div className="flex items-start gap-2 rounded-xl border border-ok bg-ok-soft p-4 text-sm text-ok">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This placement is finalized. Its assessment and attestation are locked and can no longer be changed.</span>
        </div>
      )}

      {/* Learning objectives — define + track per-objective progress */}
      <ObjectivesPanel placementId={placement.id} canDefine={!isFinalized} />

      {/* Final-grade component scores (own three only) */}
      <GradePanel placementId={placement.id} />

      {/* Weekly comment link — issue/email the industry supervisor a formative-comment link */}
      <WeeklyLinkPanel
        placementId={placement.id}
        totalWeeks={Math.max(sortedEntries.length ? sortedEntries[sortedEntries.length - 1].weekNumber : 0, 1)}
      />

      {/* SIWES daily logbook — read-only chain-aware calendar (supervisor oversight) */}
      <SiwesCalendarPanel placementId={placement.id} />

      {/* Weekly resolution */}
      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ClipboardCheck className="h-4 w-4 text-brand-ink" /> Weekly entries
        </h3>
        {entriesLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : sortedEntries.length === 0 ? (
          <p className="text-sm text-ink-muted">No logbook entries on this placement yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map((e: LogbookEntry) => {
              const resolved = e.status === 'acknowledged';
              return (
                <div key={e.id} className="rounded-lg border border-line bg-surface-sunken p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">Week {e.weekNumber}</span>
                    <span className="flex items-center gap-1.5">
                      {!!e.lateDays && (
                        <span
                          title={`the latest by ${e.maxDaysLate} day(s)`}
                          className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn"
                        >
                          <Clock className="h-3 w-3" /> {e.lateDays} logged late
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WEEK_PILL[e.status]}`}>
                        {WEEK_LABEL[e.status]}
                      </span>
                    </span>
                  </div>
                  {!resolved && !isFinalized && (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-warn">
                        Not acknowledged — provide a waiver reason to finalize
                      </label>
                      <input
                        type="text"
                        value={waivers[e.weekNumber] ?? ''}
                        aria-invalid={!!waiverError(waivers[e.weekNumber])}
                        onChange={(ev) => setWaivers((w) => ({ ...w, [e.weekNumber]: ev.target.value }))}
                        placeholder="Reason for waiving this week…"
                        className={inputCls}
                      />
                      <FieldError message={waiverError(waivers[e.weekNumber])} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assessment */}
      {!isFinalized && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Award className="h-4 w-4 text-brand-ink" /> Final assessment
          </h3>
          {hasAssessment && (
            <p className="mb-3 text-xs text-warn">
              An assessment is already on record. Submitting again updates the grade and narrative.
            </p>
          )}
          {assessMsg ? (
            <div className="flex items-start gap-2 text-sm text-ok">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {assessMsg}
            </div>
          ) : (
            <>
              <label htmlFor="grade" className="mb-1.5 block text-sm font-semibold text-ink">
                Grade <span className="ml-2 text-xs font-normal text-ink-secondary">e.g. A, B+, Pass</span>
              </label>
              <input
                id="grade" type="text" value={grade}
                aria-invalid={!!gradeError}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Final grade"
                className={inputCls}
              />
              <div className="mb-4"><FieldError message={gradeError} /></div>
              <label htmlFor="narrative" className="mb-1.5 block text-sm font-semibold text-ink">
                Narrative <span className="ml-2 text-xs font-normal text-ink-secondary">Optional</span>
              </label>
              <textarea
                id="narrative" rows={4} value={narrative}
                aria-invalid={!!narrativeError}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Summarise the intern's overall performance…"
                className={`${inputCls} resize-none`}
              />
              <FieldError message={narrativeError} />

              {/* Structured end-of-placement evaluation (optional) */}
              <div className="mt-4 rounded-lg border border-line bg-surface-sunken p-4">
                <p className="mb-2 text-sm font-semibold text-ink">
                  End-of-placement evaluation
                  <span className="ml-2 text-xs font-normal text-ink-secondary">Optional · rate 1–5</span>
                </p>
                {criteria.map((c, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                      value={c.criterion}
                      onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))}
                      placeholder="Criterion (e.g. Technical skill)"
                      maxLength={200}
                      className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                    />
                    <select
                      value={c.rating}
                      onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, rating: Number(e.target.value) } : x)))}
                      className="rounded-lg border border-line px-2 py-2 text-sm outline-none focus:border-brand"
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button
                      type="button" aria-label="Remove criterion"
                      onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
                      className="rounded p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCriteria((cs) => [...cs, { criterion: '', rating: 3 }])}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add criterion
                </button>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-ink-secondary">Overall recommendation</label>
                  <select
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
                    className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  >
                    <option value="">—</option>
                    <option value="pass">Pass</option>
                    <option value="distinction">Distinction</option>
                    <option value="resit">Resit</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              </div>

              {assessErr && (
                <div className="mt-2 flex items-start gap-2 text-xs text-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {assessErr}
                </div>
              )}
              <button
                type="button" onClick={handleRecord} disabled={recordAssessment.isPending}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recordAssessment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                {hasAssessment ? 'Update assessment' : 'Record assessment'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Company attestation invite */}
      {!isFinalized && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <Link2 className="h-4 w-4 text-brand-ink" /> Company attestation
          </h3>
          <p className="mb-3 text-xs text-ink-secondary">
            Generate a single-use link for the company supervisor to confirm the placement. Send it to them by email.
          </p>
          {inviteData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken p-2.5">
                <span className="flex-1 truncate font-mono text-xs text-ink">{inviteData.url}</span>
                <button
                  type="button" onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-soft px-2.5 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand-soft"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                Expires {new Date(inviteData.expiresAt).toLocaleString('en-GB')}. Generating a new link invalidates this one.
              </p>
            </div>
          ) : (
            <>
              {inviteErr && (
                <div className="mb-2 flex items-start gap-2 text-xs text-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {inviteErr}
                </div>
              )}
              <button
                type="button" onClick={handleInvite} disabled={invite.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Generate attestation link
              </button>
            </>
          )}
        </div>
      )}

      {/* Finalize */}
      {!isFinalized && (
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="mb-1 text-sm font-semibold text-ink">Finalize placement</h3>
          <p className="mb-3 text-xs text-ink-secondary">
            Closes the internship. This is permanent — the assessment locks and no further weeks can be reviewed.
          </p>
          {!hasAssessment && (
            <p className="mb-2 text-xs text-warn">Record the final assessment above before finalizing.</p>
          )}
          {unresolved.length > 0 && (
            <p className="mb-2 text-xs text-warn">
              {unresolved.length} week{unresolved.length === 1 ? '' : 's'} not acknowledged — each needs a waiver reason above.
            </p>
          )}
          {finalizeErr && (
            <div className="mb-2 flex items-start gap-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {finalizeErr}
            </div>
          )}
          <button
            type="button" onClick={handleFinalize}
            disabled={finalize.isPending || !hasAssessment || !allWaived}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ok px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ok disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Finalize placement
          </button>
        </div>
      )}
    </div>
  );
}

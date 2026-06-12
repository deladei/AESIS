import { useState, useEffect, useMemo } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, Inbox, Award, Lock, Link2, Copy, Check,
  ClipboardCheck, CalendarDays, Plus, X,
} from 'lucide-react';
import {
  useAssignedPlacements, type Placement, type FinalizationStatus,
} from '@/hooks/usePlacements';
import { ObjectivesPanel } from '@/components/objectives/ObjectivesPanel';
import { useEntries, type LogbookEntry, type EntryStatus } from '@/hooks/useEntries';
import {
  useRecordAssessment, useFinalizePlacement, useInviteAttestation,
  type AttestationInvite, type WeekWaiver,
} from '@/hooks/useFinalization';

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
  active:             'bg-[#eef0f5] text-[#64748b]',
  assessment_pending: 'bg-[#fff4e0] text-[#9a6700]',
  finalized:          'bg-[#dcf5e6] text-[#1b7a45]',
};

const WEEK_PILL: Record<EntryStatus, string> = {
  draft:        'bg-[#eef0f5] text-[#64748b]',
  submitted:    'bg-[#e1e8ff] text-[#15157d]',
  returned:     'bg-[#fff1ee] text-[#b3261e]',
  acknowledged: 'bg-[#dcf5e6] text-[#1b7a45]',
  rejected:     'bg-[#fde7e7] text-[#8a1c1c]',
};
const WEEK_LABEL: Record<EntryStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', returned: 'Returned',
  acknowledged: 'Acknowledged', rejected: 'Rejected',
};

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

const inputCls =
  'w-full rounded-lg border border-[#d8dce6] bg-white px-3 py-2.5 text-sm text-[#0b1c30] placeholder-[#94a3b8] transition-colors focus:border-[#8a4cfc] focus:outline-none focus:ring-1 focus:ring-[#8a4cfc]';

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
        <Loader2 className="h-6 w-6 animate-spin text-[#8a4cfc]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#0b1c30]">Finalize placements</h1>
        <p className="mt-0.5 text-sm text-[#464652]">
          Record the final assessment, confirm every week is resolved, and close out the internship.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Placement list */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[#e2e6ef] bg-white">
            <div className="border-b border-[#e2e6ef] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Your interns
            </div>
            {placements.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Inbox className="mx-auto mb-2 h-7 w-7 text-[#cbd2e0]" />
                <p className="text-sm text-[#94a3b8]">No active placements assigned to you.</p>
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
                      className={`w-full border-b border-[#f0f2f7] px-4 py-3 text-left transition-colors last:border-0 ${
                        active ? 'bg-[#f1ecff]' : 'hover:bg-[#f8f9ff]'
                      }`}
                    >
                      <p className={`truncate text-sm font-semibold ${active ? 'text-[#15157d]' : 'text-[#0b1c30]'}`}>
                        {placementName(p)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#64748b]">{p.company?.name ?? 'Placement'}</p>
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
            <div className="rounded-xl border border-dashed border-[#d8dce6] bg-white py-24 text-center">
              <Award className="mx-auto mb-3 h-10 w-10 text-[#cbd2e0]" />
              <h2 className="text-base font-semibold text-[#0b1c30]">Nothing to finalize</h2>
              <p className="mt-1 text-sm text-[#64748b]">Your assigned placements will appear here.</p>
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
    if (!grade.trim()) { setAssessErr('A grade is required.'); return; }
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
        grade: grade.trim(),
        narrative: narrative.trim() || undefined,
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
    if (payload.some((w) => !w.reason)) {
      setFinalizeErr('Every unacknowledged week needs a waiver reason before you can finalize.');
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
      <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#0b1c30]">{placementName(placement)}</h2>
            <p className="text-sm text-[#464652]">{placement.company?.name ?? '—'}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#64748b]">
              <CalendarDays className="h-3 w-3" /> {fmtRange(placement.startDate, placement.endDate)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${FINAL_PILL[fs]}`}>
            {FINAL_LABEL[fs]}
          </span>
        </div>
      </div>

      {isFinalized && (
        <div className="flex items-start gap-2 rounded-xl border border-[#aee3c2] bg-[#f0faf4] p-4 text-sm text-[#1b7a45]">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This placement is finalized. Its assessment and attestation are locked and can no longer be changed.</span>
        </div>
      )}

      {/* Learning objectives — define + track per-objective progress */}
      <ObjectivesPanel placementId={placement.id} canDefine={!isFinalized} />

      {/* Weekly resolution */}
      <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
          <ClipboardCheck className="h-4 w-4 text-[#8a4cfc]" /> Weekly entries
        </h3>
        {entriesLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#cbd2e0]" />
          </div>
        ) : sortedEntries.length === 0 ? (
          <p className="text-sm text-[#94a3b8]">No logbook entries on this placement yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedEntries.map((e: LogbookEntry) => {
              const resolved = e.status === 'acknowledged';
              return (
                <div key={e.id} className="rounded-lg border border-[#eef0f5] bg-[#fbfcfe] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[#0b1c30]">Week {e.weekNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WEEK_PILL[e.status]}`}>
                      {WEEK_LABEL[e.status]}
                    </span>
                  </div>
                  {!resolved && !isFinalized && (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-[#9a6700]">
                        Not acknowledged — provide a waiver reason to finalize
                      </label>
                      <input
                        type="text"
                        value={waivers[e.weekNumber] ?? ''}
                        onChange={(ev) => setWaivers((w) => ({ ...w, [e.weekNumber]: ev.target.value }))}
                        placeholder="Reason for waiving this week…"
                        className={inputCls}
                      />
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
        <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
            <Award className="h-4 w-4 text-[#8a4cfc]" /> Final assessment
          </h3>
          {hasAssessment && (
            <p className="mb-3 text-xs text-[#9a6700]">
              An assessment is already on record. Submitting again updates the grade and narrative.
            </p>
          )}
          {assessMsg ? (
            <div className="flex items-start gap-2 text-sm text-[#1b7a45]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {assessMsg}
            </div>
          ) : (
            <>
              <label htmlFor="grade" className="mb-1.5 block text-sm font-semibold text-[#0b1c30]">
                Grade <span className="ml-2 text-xs font-normal text-[#64748b]">e.g. A, B+, Pass</span>
              </label>
              <input
                id="grade" type="text" value={grade} maxLength={20}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Final grade"
                className={`${inputCls} mb-4`}
              />
              <label htmlFor="narrative" className="mb-1.5 block text-sm font-semibold text-[#0b1c30]">
                Narrative <span className="ml-2 text-xs font-normal text-[#64748b]">Optional</span>
              </label>
              <textarea
                id="narrative" rows={4} value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Summarise the intern's overall performance…"
                className={`${inputCls} resize-none`}
              />

              {/* Structured end-of-placement evaluation (optional) */}
              <div className="mt-4 rounded-lg border border-[#e2e6ef] bg-[#fbfcfe] p-4">
                <p className="mb-2 text-sm font-semibold text-[#0b1c30]">
                  End-of-placement evaluation
                  <span className="ml-2 text-xs font-normal text-[#64748b]">Optional · rate 1–5</span>
                </p>
                {criteria.map((c, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                      value={c.criterion}
                      onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))}
                      placeholder="Criterion (e.g. Technical skill)"
                      maxLength={200}
                      className="flex-1 rounded-lg border border-[#d8dce6] px-3 py-2 text-sm outline-none focus:border-[#15157d]"
                    />
                    <select
                      value={c.rating}
                      onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, rating: Number(e.target.value) } : x)))}
                      className="rounded-lg border border-[#d8dce6] px-2 py-2 text-sm outline-none focus:border-[#15157d]"
                    >
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <button
                      type="button" aria-label="Remove criterion"
                      onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}
                      className="rounded p-1.5 text-[#94a3b8] hover:bg-[#fde7e7] hover:text-[#8a1c1c]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCriteria((cs) => [...cs, { criterion: '', rating: 3 }])}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15157d] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add criterion
                </button>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-[#64748b]">Overall recommendation</label>
                  <select
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
                    className="rounded-lg border border-[#d8dce6] px-3 py-2 text-sm outline-none focus:border-[#15157d]"
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
                <div className="mt-2 flex items-start gap-2 text-xs text-[#b3261e]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {assessErr}
                </div>
              )}
              <button
                type="button" onClick={handleRecord} disabled={recordAssessment.isPending}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-[#15157d] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1f1fa0] disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
            <Link2 className="h-4 w-4 text-[#8a4cfc]" /> Company attestation
          </h3>
          <p className="mb-3 text-xs text-[#64748b]">
            Generate a single-use link for the company supervisor to confirm the placement. Send it to them by email.
          </p>
          {inviteData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-[#e2e6ef] bg-[#fbfcfe] p-2.5">
                <span className="flex-1 truncate font-mono text-xs text-[#0b1c30]">{inviteData.url}</span>
                <button
                  type="button" onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#eff4ff] px-2.5 py-1.5 text-xs font-semibold text-[#15157d] transition-colors hover:bg-[#dce9ff]"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-[#94a3b8]">
                Expires {new Date(inviteData.expiresAt).toLocaleString('en-GB')}. Generating a new link invalidates this one.
              </p>
            </div>
          ) : (
            <>
              {inviteErr && (
                <div className="mb-2 flex items-start gap-2 text-xs text-[#b3261e]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {inviteErr}
                </div>
              )}
              <button
                type="button" onClick={handleInvite} disabled={invite.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#c7c5d4] bg-white px-4 py-2.5 text-sm font-semibold text-[#15157d] transition-colors hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="rounded-xl border border-[#e2e6ef] bg-white p-5">
          <h3 className="mb-1 text-sm font-semibold text-[#0b1c30]">Finalize placement</h3>
          <p className="mb-3 text-xs text-[#64748b]">
            Closes the internship. This is permanent — the assessment locks and no further weeks can be reviewed.
          </p>
          {!hasAssessment && (
            <p className="mb-2 text-xs text-[#9a6700]">Record the final assessment above before finalizing.</p>
          )}
          {unresolved.length > 0 && (
            <p className="mb-2 text-xs text-[#9a6700]">
              {unresolved.length} week{unresolved.length === 1 ? '' : 's'} not acknowledged — each needs a waiver reason above.
            </p>
          )}
          {finalizeErr && (
            <div className="mb-2 flex items-start gap-2 text-xs text-[#b3261e]">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {finalizeErr}
            </div>
          )}
          <button
            type="button" onClick={handleFinalize}
            disabled={finalize.isPending || !hasAssessment || !allWaived}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b7a45] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#15633a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {finalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Finalize placement
          </button>
        </div>
      )}
    </div>
  );
}

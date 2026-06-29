import { useEffect, useMemo, useState } from 'react';
import {
  Award, Lock, Loader2, CheckCircle2, ShieldCheck, Send, Pencil, AlertCircle, Link2, Copy, Check,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useGrade, useScoreComponent, useAggregateGrade, useOverrideGrade, useReleaseGrade, useInviteIndustry,
  type GradeView, type GradeStatus, type GradeComponent,
} from '@/hooks/useGrade';

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

const STATUS_LABEL: Record<GradeStatus, string> = {
  draft: 'In progress', approved: 'Signed off', released: 'Released',
};
const STATUS_PILL: Record<GradeStatus, string> = {
  draft:    'bg-[var(--h-eef0f5)] text-[var(--h-64748b)]',
  approved: 'bg-[var(--h-e1e8ff)] text-[var(--h-15157d)]',
  released: 'bg-[var(--h-dcf5e6)] text-[var(--h-1b7a45)]',
};

const COMPONENT_META: Record<GradeComponent, { label: string; hint: string }> = {
  industry:   { label: 'Industry',   hint: 'Company supervisor' },
  university: { label: 'University',  hint: 'Academic supervisor' },
  report:     { label: 'Report',     hint: 'Project report' },
  logbook:    { label: 'Logbook',    hint: 'Weekly logbook' },
};

const card = 'rounded-xl border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] p-5';
const inputCls =
  'w-24 rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-2.5 py-1.5 text-sm text-[var(--h-0b1c30)] outline-none focus:border-[var(--h-15157d)]';

function StatusPill({ status }: { status: GradeStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function fmtScore(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100);
}

/** A single editable component score row (coordinator/supervisor entry). */
function ComponentRow({
  component, value, weighted, locked, onSave, saving,
}: {
  component: GradeComponent;
  value: number | null | undefined;
  weighted?: number | null;
  locked: boolean;
  saving: boolean;
  onSave: (raw: number) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const meta = COMPONENT_META[component];
  const num = typeof draft === 'string' ? Number(draft) : draft;
  const valid = draft !== '' && Number.isFinite(num) && num >= 0 && num <= 100;
  const changed = String(value ?? '') !== String(draft);
  const inputId = `grade-${component}`;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--h-eef0f5)] py-2.5 last:border-0">
      <div>
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--h-0b1c30)]">{meta.label}</label>
        <p className="text-xs text-[var(--h-757684)]">
          {meta.hint}
          {weighted !== null && weighted !== undefined && (
            <span> · contributes {fmtScore(weighted)} to total</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number" min={0} max={100} step="0.5"
          className={inputCls}
          value={draft}
          disabled={locked || saving}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="0–100"
        />
        <button
          type="button"
          disabled={locked || saving || !valid || !changed}
          onClick={() => onSave(num)}
          className="inline-flex h-8 w-16 items-center justify-center rounded-lg bg-[var(--h-15157d)] text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Coordinator / admin: full console ─────────────────────────
function GradeConsole({ placementId, grade }: { placementId: string; grade: GradeView }) {
  const score    = useScoreComponent(placementId);
  const aggregate = useAggregateGrade(placementId);
  const override  = useOverrideGrade(placementId);
  const release   = useReleaseGrade(placementId);
  const invite    = useInviteIndustry(placementId);

  const [showOverride, setShowOverride] = useState(false);
  const [ovTotal, setOvTotal] = useState('');
  const [ovReason, setOvReason] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onInvite = () => {
    invite.mutate(undefined, { onSuccess: (res) => { setInviteUrl(res.url); setCopied(false); } });
  };
  const onCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const components = grade.components ?? {};
  const allEntered = (['industry', 'university', 'report', 'logbook'] as GradeComponent[])
    .every((c) => components[c]?.raw !== null && components[c]?.raw !== undefined);
  const locked = grade.status === 'released';
  const err = score.error ?? aggregate.error ?? override.error ?? release.error ?? invite.error;

  const onOverride = () => {
    const total = Number(ovTotal);
    if (!Number.isFinite(total) || total < 0 || total > 100 || !ovReason.trim()) return;
    override.mutate({ total, reason: ovReason.trim() }, {
      onSuccess: () => { setShowOverride(false); setOvTotal(''); setOvReason(''); },
    });
  };

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--h-0b1c30)]">
          <Award className="h-4 w-4 text-[var(--h-15157d)]" /> Final grade
        </h3>
        <StatusPill status={grade.status} />
      </div>

      {err && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--h-fff1ee)] p-2.5 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {apiErr(err)}
        </div>
      )}

      <div className="mb-4">
        {(['industry', 'university', 'report', 'logbook'] as GradeComponent[]).map((c) => (
          <ComponentRow
            key={c}
            component={c}
            value={components[c]?.raw}
            weighted={components[c]?.weighted}
            locked={locked}
            saving={score.isPending && score.variables?.component === c}
            onSave={(raw) => score.mutate({ component: c, raw })}
          />
        ))}
      </div>

      {/* Industry score delegation — request it from the company supervisor via magic link */}
      {!locked && (
        <div className="mb-4 rounded-lg border border-dashed border-[var(--h-c4c5d5-60)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--h-757684)]">
              Enter the industry score above, or send the company supervisor a secure link to submit it themselves.
            </p>
            <button
              type="button"
              disabled={invite.isPending}
              onClick={onInvite}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5-60)] px-2.5 py-1.5 text-xs font-semibold text-[var(--h-15157d)] hover:bg-[var(--h-f3f3f7)] disabled:opacity-40"
            >
              {invite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              {inviteUrl ? 'New link' : 'Request via link'}
            </button>
          </div>
          {inviteUrl && (
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly value={inviteUrl}
                className="min-w-0 flex-1 rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-f3f3f7)] px-2.5 py-1.5 text-xs text-[var(--h-444653)]"
              />
              <button
                type="button" onClick={onCopy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--h-15157d)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="mb-4 flex items-end justify-between rounded-lg bg-[var(--h-f3f3f7)] p-3">
        <div>
          <p className="text-xs text-[var(--h-757684)]">Aggregated total</p>
          <p className="text-2xl font-bold text-[var(--h-0b1c30)]">{fmtScore(grade.total)}<span className="text-sm font-normal text-[var(--h-757684)]">/100</span></p>
          {grade.coordinatorOverride !== null && grade.coordinatorOverride !== undefined && (
            <p className="mt-0.5 text-xs text-[var(--h-9a6700)]">Override: {fmtScore(grade.coordinatorOverride)} — {grade.overrideReason}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--h-757684)]">Effective</p>
          <p className="text-lg font-bold text-[var(--h-15157d)]">{fmtScore(grade.effectiveTotal)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {grade.status === 'draft' && (
          <button
            type="button"
            disabled={!allEntered || aggregate.isPending}
            onClick={() => aggregate.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-15157d)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            title={allEntered ? '' : 'Enter all four component scores first'}
          >
            {aggregate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Aggregate & sign off
          </button>
        )}
        {grade.status === 'approved' && (
          <>
            <button
              type="button"
              onClick={() => setShowOverride((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5-60)] px-3 py-2 text-xs font-semibold text-[var(--h-0b1c30)] hover:bg-[var(--h-f3f3f7)]"
            >
              <Pencil className="h-3.5 w-3.5" /> Override
            </button>
            <button
              type="button"
              disabled={release.isPending}
              onClick={() => release.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--h-1b7a45)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {release.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Release to student
            </button>
          </>
        )}
        {grade.status === 'released' && (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--h-1b7a45)]">
            <CheckCircle2 className="h-4 w-4" /> Released{grade.releasedAt ? ` on ${new Date(grade.releasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </p>
        )}
      </div>

      {showOverride && grade.status === 'approved' && (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--h-c4c5d5-60)] p-3">
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={100} step="0.5"
              className={inputCls} value={ovTotal}
              onChange={(e) => setOvTotal(e.target.value)} placeholder="New /100"
            />
            <span className="text-xs text-[var(--h-757684)]">replaces the aggregated total</span>
          </div>
          <textarea
            className="w-full rounded-lg border border-[var(--h-c4c5d5-60)] bg-[var(--h-ffffff)] px-2.5 py-1.5 text-sm text-[var(--h-0b1c30)] outline-none focus:border-[var(--h-15157d)]"
            rows={2} value={ovReason}
            onChange={(e) => setOvReason(e.target.value)}
            placeholder="Reason (required — recorded and audited)"
          />
          <button
            type="button"
            disabled={override.isPending || !ovReason.trim() || ovTotal === ''}
            onClick={onOverride}
            className="rounded-lg bg-[var(--h-15157d)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {override.isPending ? 'Saving…' : 'Save override'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Academic supervisor: own three components only ────────────
function SupervisorComponents({ placementId, grade }: { placementId: string; grade: GradeView }) {
  const score = useScoreComponent(placementId);
  const components = grade.components ?? {};
  const locked = grade.status === 'released';
  const mine: GradeComponent[] = ['university', 'report', 'logbook'];

  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--h-0b1c30)]">
          <Award className="h-4 w-4 text-[var(--h-15157d)]" /> Assessment scores
        </h3>
        <StatusPill status={grade.status} />
      </div>
      {score.error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--h-fff1ee)] p-2.5 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {apiErr(score.error)}
        </div>
      )}
      <div>
        {mine.map((c) => (
          <ComponentRow
            key={c}
            component={c}
            value={components[c]?.raw}
            weighted={components[c]?.weighted}
            locked={locked}
            saving={score.isPending && score.variables?.component === c}
            onSave={(raw) => score.mutate({ component: c, raw })}
          />
        ))}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--h-757684)]">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        The industry score and the aggregated total are set and held by the coordinator.
      </p>
    </div>
  );
}

// ── Student: released total only ──────────────────────────────
function StudentGrade({ grade }: { grade: GradeView }) {
  if (!grade.released) {
    return (
      <div className={card}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--h-0b1c30)]">
          <Award className="h-4 w-4 text-[var(--h-15157d)]" /> Final grade
        </h3>
        <p className="flex items-start gap-2 text-sm text-[var(--h-444653)]">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--h-15157d)]" />
          Your final grade will appear here once it has been signed off and released.
        </p>
      </div>
    );
  }
  return (
    <div className={card}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--h-0b1c30)]">
        <Award className="h-4 w-4 text-[var(--h-15157d)]" /> Final grade
      </h3>
      <p className="text-4xl font-bold text-[var(--h-15157d)]">
        {fmtScore(grade.total)}<span className="text-lg font-normal text-[var(--h-757684)]">/100</span>
      </p>
      {grade.releasedAt && (
        <p className="mt-1 text-xs text-[var(--h-757684)]">
          Released on {new Date(grade.releasedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

/**
 * Role-aware final-grade panel. The backend serializer already role-filters the
 * payload (grades.policy.serializeGrade); this picks the matching surface.
 */
export function GradePanel({ placementId }: { placementId: string }) {
  const { user } = useAuth();
  const { data: grade, isLoading, isError } = useGrade(placementId);

  const role = user?.role;
  const body = useMemo(() => {
    if (!grade) return null;
    if (role === 'coordinator' || role === 'admin') return <GradeConsole placementId={placementId} grade={grade} />;
    if (role === 'academic_supervisor') return <SupervisorComponents placementId={placementId} grade={grade} />;
    if (role === 'student') return <StudentGrade grade={grade} />;
    return null;
  }, [grade, role, placementId]);

  if (isLoading) {
    return (
      <div className={`${card} flex items-center justify-center`}>
        <Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" />
      </div>
    );
  }
  if (isError || !grade) {
    // A placement with no grade row yet still returns a default draft view, so a
    // hard error here is a genuine load/permission failure — stay quiet for the
    // student, surface nothing intrusive.
    return null;
  }
  return body;
}

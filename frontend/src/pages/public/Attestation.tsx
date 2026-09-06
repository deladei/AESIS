import { useState } from 'react';
// Mirrors finalization.schema's `comment: max(2000)`.
// Matches finalization.schema.attestSchema — the form used to stop at 2000 and
// silently truncate the paste, so a supervisor writing a long remark lost the
// tail with no message and no way to know.
const ATTESTATION_COMMENT_MAX = 5000;
const commentRule = optionalFreeText(ATTESTATION_COMMENT_MAX, 'Comment');
import { useParams } from 'react-router-dom';
import {
  Loader2, GraduationCap, CheckCircle2, AlertCircle, ShieldCheck, CalendarDays,
} from 'lucide-react';
import { useAttestationContext, useSubmitAttestation } from '@/hooks/useFinalization';
import { optionalFreeText } from '@/lib/validation';
import { FieldError } from '@/components/shared/FieldError';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--h-f8f9ff)] px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--h-15157d)]">
          <GraduationCap className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight text-[var(--h-15157d)]">AESIS</h1>
          <p className="text-[11px] font-semibold text-[var(--h-464652)]">Company Attestation</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-7 shadow-sm">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--h-94a3b8)]">AI-Enhanced Student Internship Supervision System</p>
    </div>
  );
}

export default function Attestation() {
  const { token } = useParams<{ token: string }>();
  const { data: ctx, isLoading, isError, error } = useAttestationContext(token);
  const submit = useSubmitAttestation(token);

  const [confirmed, setConfirmed] = useState(true);
  const [comment, setComment] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ confirmed: boolean } | null>(null);

  const commentCheck = commentRule.safeParse(comment);
  const commentError = commentCheck.success ? undefined : commentCheck.error.issues[0]?.message;

  const handleSubmit = async () => {
    setFormErr(null);
    if (!commentCheck.success) return;
    try {
      const res = await submit.mutateAsync({ confirmed, comment: commentCheck.data });
      setDone({ confirmed: res.confirmed });
    } catch (e) {
      setFormErr(
        ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
        'Could not submit your attestation. Please try again.',
      );
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
        </div>
      </Shell>
    );
  }

  if (isError || !ctx) {
    const code = statusOf(error);
    const msg =
      code === 410 ? 'This attestation link has expired or has already been used.'
      : 'This attestation link is invalid. Please check the link, or ask the academic supervisor to send a new one.';
    return (
      <Shell>
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-[var(--h-f5b8ad)]" />
          <h2 className="text-base font-semibold text-[var(--h-0b1c30)]">Link unavailable</h2>
          <p className="mt-1.5 text-sm text-[var(--h-64748b)]">{msg}</p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[var(--h-aee3c2)]" />
          <h2 className="text-lg font-semibold text-[var(--h-0b1c30)]">Thank you</h2>
          <p className="mt-1.5 text-sm text-[var(--h-64748b)]">
            {done.confirmed
              ? `Your confirmation of ${ctx.student}'s placement has been recorded.`
              : `Your response on ${ctx.student}'s placement has been recorded.`}
            {' '}You can close this page.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">Confirm this placement</h2>
        <p className="mt-1 text-sm text-[var(--h-64748b)]">
          As the company supervisor, please confirm that the details below are accurate.
        </p>
      </div>

      <dl className="mb-5 space-y-3 rounded-xl border border-[var(--h-eef0f5)] bg-[var(--h-fbfcfe)] p-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Student</dt>
          <dd className="text-sm font-medium text-[var(--h-0b1c30)]">{ctx.student}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Organisation</dt>
          <dd className="text-sm font-medium text-[var(--h-0b1c30)]">{ctx.organisation ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Placement period</dt>
          <dd className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--h-0b1c30)]">
            <CalendarDays className="h-3.5 w-3.5 text-[var(--h-8a4cfc)]" />
            {fmtDate(ctx.startDate)} – {fmtDate(ctx.endDate)}
          </dd>
        </div>
      </dl>

      <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--h-d8dce6)] p-3 transition-colors hover:bg-[var(--h-f8f9ff)]">
        <input
          type="checkbox" checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--h-c7c5d4)] text-[var(--h-15157d)] focus:ring-[var(--h-8a4cfc)]"
        />
        <span className="text-sm text-[var(--h-0b1c30)]">
          I confirm that this student completed the placement as described at our organisation.
        </span>
      </label>

      <label htmlFor="comment" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
        Comment <span className="ml-2 text-xs font-normal text-[var(--h-64748b)]">Optional</span>
      </label>
      <textarea
        id="comment" rows={3} value={comment}
        aria-invalid={!!commentError}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Any remarks on the intern's performance…"
        className="mb-1 w-full resize-none rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2.5 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]"
      />
      <FieldError message={commentError} />
      <p className="mb-4 text-right text-[11px] text-[var(--h-94a3b8)]">
        {comment.length}/{ATTESTATION_COMMENT_MAX}
      </p>

      {formErr && (
        <div className="mb-3 flex items-start gap-2 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formErr}
        </div>
      )}

      <button
        type="button" onClick={handleSubmit} disabled={submit.isPending || !!commentError}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Submit attestation
      </button>
      <p className="mt-3 text-center text-[11px] text-[var(--h-94a3b8)]">
        This is a single-use, secure link. Your response is final once submitted.
      </p>
    </Shell>
  );
}

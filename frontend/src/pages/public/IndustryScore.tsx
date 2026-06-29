import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, GraduationCap, CheckCircle2, AlertCircle, Award, CalendarDays,
} from 'lucide-react';
import { useIndustryContext, useSubmitIndustryScore } from '@/hooks/useGrade';

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
          <p className="text-[11px] font-semibold text-[var(--h-464652)]">Company Supervisor Score</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-7 shadow-sm">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--h-94a3b8)]">AI-Enhanced Student Internship Supervision System</p>
    </div>
  );
}

export default function IndustryScore() {
  const { token } = useParams<{ token: string }>();
  const { data: ctx, isLoading, isError, error } = useIndustryContext(token);
  const submit = useSubmitIndustryScore(token ?? '');

  const [score, setScore] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const num = Number(score);
  const valid = score !== '' && Number.isFinite(num) && num >= 0 && num <= 100;

  const handleSubmit = async () => {
    setFormErr(null);
    if (!valid) { setFormErr('Enter a score between 0 and 100.'); return; }
    try {
      await submit.mutateAsync(num);
      setDone(true);
    } catch (e) {
      setFormErr(
        ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
        'Could not submit the score. Please try again.',
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
      code === 410 ? 'This scoring link has expired or has already been used.'
      : 'This scoring link is invalid. Please check the link, or ask the coordinator to send a new one.';
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
            Your assessment score for {ctx.student} has been recorded. You can close this page.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">Submit your assessment score</h2>
        <p className="mt-1 text-sm text-[var(--h-64748b)]">
          As the company supervisor, please give this intern an overall score out of 100.
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

      <label htmlFor="score" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
        Overall score <span className="ml-2 text-xs font-normal text-[var(--h-64748b)]">0–100</span>
      </label>
      <input
        id="score" type="number" min={0} max={100} step="0.5" value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder="e.g. 78"
        className="mb-4 w-full rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2.5 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]"
      />

      {formErr && (
        <div className="mb-3 flex items-start gap-2 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formErr}
        </div>
      )}

      <button
        type="button" onClick={handleSubmit} disabled={submit.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
        Submit score
      </button>
      <p className="mt-3 text-center text-[11px] text-[var(--h-94a3b8)]">
        This is a single-use, secure link. Your score is final once submitted and is not shared with the student or academic supervisor.
      </p>
    </Shell>
  );
}

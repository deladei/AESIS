import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, GraduationCap, CheckCircle2, AlertCircle, MessageSquareText,
} from 'lucide-react';
import { useWeeklyCommentContext, useSubmitWeeklyComment } from '@/hooks/useWeeklyComment';
import { freeText } from '@/lib/validation';

const MAX_LEN = 2000;

// The rule the API parses this body with (industry.schema.digitalWeeklyCommentSchema),
// rebuilt from the same shared primitives so the message under the box is the
// message the server would have sent back.
const commentRule = freeText(MAX_LEN, 'Comment').min(3, 'Comment is too short');

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
          <p className="text-[11px] font-semibold text-[var(--h-464652)]">Weekly Supervisor Comment</p>
        </div>
      </div>
      <div className="w-full max-w-md rounded-2xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-7 shadow-sm">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--h-94a3b8)]">AI-Enhanced Student Internship Supervision System</p>
    </div>
  );
}

export default function WeeklyComment() {
  const { token } = useParams<{ token: string }>();
  const { data: ctx, isLoading, isError, error } = useWeeklyCommentContext(token);
  const submit = useSubmitWeeklyComment(token ?? '');

  const [comment, setComment] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const trimmed = comment.trim();
  const parsed = commentRule.safeParse(comment);
  const valid = parsed.success;

  const handleSubmit = async () => {
    setFormErr(null);
    if (!parsed.success) { setFormErr(parsed.error.issues[0]?.message ?? 'Please write a short comment.'); return; }
    try {
      await submit.mutateAsync(trimmed);
      setDone(true);
    } catch (e) {
      setFormErr(
        ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
        'Could not submit the comment. Please try again.',
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
      code === 410 ? 'This comment link has expired or has already been used.'
      : 'This comment link is invalid. Please check the link, or ask the coordinator to send a new one.';
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
            Your week {ctx.weekNumber} comment for {ctx.studentName} has been recorded in their
            logbook. You can close this page.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-[var(--h-0b1c30)]">Week {ctx.weekNumber} — supervisor's comment</h2>
        <p className="mt-1 text-sm text-[var(--h-64748b)]">
          Please comment briefly on the trainee's performance and conduct this week. Your comment
          goes into their logbook over your name.
        </p>
      </div>

      <dl className="mb-5 space-y-3 rounded-xl border border-[var(--h-eef0f5)] bg-[var(--h-fbfcfe)] p-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Trainee</dt>
          <dd className="text-sm font-medium text-[var(--h-0b1c30)]">{ctx.studentName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Supervisor</dt>
          <dd className="text-sm font-medium text-[var(--h-0b1c30)]">{ctx.supervisorName}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--h-64748b)]">Organisation</dt>
          <dd className="text-sm font-medium text-[var(--h-0b1c30)]">{ctx.companyName ?? '—'}</dd>
        </div>
      </dl>

      <label htmlFor="comment" className="mb-1.5 block text-sm font-semibold text-[var(--h-0b1c30)]">
        Comment on the trainee's week
      </label>
      <textarea
        id="comment" rows={5} value={comment} maxLength={MAX_LEN}
        onChange={(e) => setComment(e.target.value)}
        placeholder="e.g. Handled the assigned tasks well and asked good questions. Punctual all week."
        className="mb-1 w-full resize-y rounded-lg border border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] px-3 py-2.5 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-8a4cfc)] focus:outline-none focus:ring-1 focus:ring-[var(--h-8a4cfc)]"
      />
      <p className="mb-4 text-right text-[11px] text-[var(--h-94a3b8)]">{comment.length}/{MAX_LEN}</p>

      {formErr && (
        <div className="mb-3 flex items-start gap-2 text-xs text-[var(--h-b3261e)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formErr}
        </div>
      )}

      <button
        type="button" onClick={handleSubmit} disabled={submit.isPending || !valid}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--h-1f1fa0)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
        Submit comment
      </button>
      <p className="mt-3 text-center text-[11px] text-[var(--h-94a3b8)]">
        This is a single-use, secure link. The trainee and their university supervisor will see this
        comment in the logbook.
      </p>
    </Shell>
  );
}

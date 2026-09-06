import { useState } from 'react';
import { Loader2, Video, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { useScheduleCall } from '@/hooks/useAdminMessaging';
import { freeText, httpUrl } from '@/lib/validation';
import { FieldError } from '@/components/shared/FieldError';

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

// The rules `scheduleCallSchema` parses this body with. The link check used to
// be a bare `^https?://` prefix test, which accepted "https://" on its own and
// any amount of junk after it.
const topicRule = freeText(200, 'Topic');
const linkRule  = httpUrl('Google Meet link', 500);

const input = 'w-full rounded-lg border border-[var(--h-c4c5d5)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-1 focus:ring-[var(--h-15157d)]';

/**
 * Google Meet call scheduler for one intern (admin-only endpoint). Lifted from
 * the retired /admin/messages page so scheduling lives beside the mentorship
 * thread in the Feedback Center.
 */
export default function ScheduleCallCard({ placementId, internName }: { placementId: string; internName: string }) {
  const schedule = useScheduleCall();
  const [when, setWhen] = useState('');
  const [topic, setTopic] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const topicCheck = topic.trim() === '' ? null : topicRule.safeParse(topic);
  const topicError = topicCheck && !topicCheck.success ? topicCheck.error.issues[0]?.message : undefined;

  const linkCheck = meetLink.trim() === '' ? null : linkRule.safeParse(meetLink);
  const linkError = linkCheck && !linkCheck.success ? linkCheck.error.issues[0]?.message : undefined;

  // A call cannot be scheduled into the past — the invite would go out already
  // stale, and nothing downstream would ever catch it.
  const whenDate = when ? new Date(when) : null;
  const whenError = whenDate && !Number.isNaN(whenDate.getTime()) && whenDate.getTime() < Date.now()
    ? 'Pick a time in the future'
    : undefined;

  const ready = !!when && !whenError && topicCheck?.success === true && linkCheck?.success === true;

  const send = () => {
    if (!ready || !topicCheck?.success || !linkCheck?.success) return;
    setErr(null); setDone(null);
    schedule.mutate(
      { placementId, scheduledAt: new Date(when).toISOString(), topic: topicCheck.data, meetLink: linkCheck.data },
      {
        onSuccess: (res) => { setDone(`Invite sent — emailed ${res.emailedTo}.`); setWhen(''); setTopic(''); setMeetLink(''); },
        onError: (e) => setErr(apiErr(e)),
      },
    );
  };

  return (
    <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--h-0b1c30)]">
        <Video className="h-4 w-4 text-[var(--h-15157d)]" /> Schedule a video call
      </h3>
      <p className="mb-3 text-xs text-[var(--h-757684)]">
        Create the room on Google Meet, paste the link, and we email the time + link to {internName.split(' ')[0]}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--h-64748b)]">When</label>
          <input
            type="datetime-local" value={when} aria-invalid={!!whenError}
            onChange={(e) => setWhen(e.target.value)} className={input}
          />
          <FieldError message={whenError} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--h-64748b)]">Topic</label>
          <input
            value={topic} aria-invalid={!!topicError}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Mid-term check-in" className={input}
          />
          <FieldError message={topicError} />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-[var(--h-64748b)]">Google Meet link</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={meetLink} aria-invalid={!!linkError}
            onChange={(e) => setMeetLink(e.target.value)}
            placeholder="https://meet.google.com/…" className={`${input} flex-1`}
          />
          <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5)] px-3 py-2 text-sm font-medium text-[var(--h-15157d)] hover:bg-[var(--h-f3f3f7)]">
            <ExternalLink className="h-4 w-4" /> New Google Meet
          </a>
        </div>
        <FieldError message={linkError} />
      </div>
      {err && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]"><AlertCircle className="h-4 w-4" /> {err}</p>}
      {done && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-1b7a45)]"><CheckCircle2 className="h-4 w-4" /> {done}</p>}
      <div className="mt-3">
        <button onClick={send} disabled={!ready || schedule.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          {schedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} Send call invite
        </button>
      </div>
    </div>
  );
}

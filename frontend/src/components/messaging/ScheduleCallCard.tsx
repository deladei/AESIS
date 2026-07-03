import { useState } from 'react';
import { Loader2, Video, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { useScheduleCall } from '@/hooks/useAdminMessaging';

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

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

  const meetValid = /^https?:\/\//i.test(meetLink.trim());

  const send = () => {
    if (!when || !topic.trim() || !meetValid) return;
    setErr(null); setDone(null);
    schedule.mutate(
      { placementId, scheduledAt: new Date(when).toISOString(), topic: topic.trim(), meetLink: meetLink.trim() },
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
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--h-64748b)]">Topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Mid-term check-in" className={input} />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-[var(--h-64748b)]">Google Meet link</label>
        <div className="flex flex-wrap items-center gap-2">
          <input value={meetLink} onChange={(e) => setMeetLink(e.target.value)} placeholder="https://meet.google.com/…" className={`${input} flex-1`} />
          <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--h-c4c5d5)] px-3 py-2 text-sm font-medium text-[var(--h-15157d)] hover:bg-[var(--h-f3f3f7)]">
            <ExternalLink className="h-4 w-4" /> New Google Meet
          </a>
        </div>
        {meetLink && !meetValid && <p className="mt-1 text-xs text-[var(--h-b3261e)]">Paste a full link (https://…).</p>}
      </div>
      {err && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]"><AlertCircle className="h-4 w-4" /> {err}</p>}
      {done && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-1b7a45)]"><CheckCircle2 className="h-4 w-4" /> {done}</p>}
      <div className="mt-3">
        <button onClick={send} disabled={!when || !topic.trim() || !meetValid || schedule.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          {schedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} Send call invite
        </button>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  Loader2, Search, Send, Video, CheckCircle2, AlertCircle, Mail, ExternalLink, MessageSquareText,
} from 'lucide-react';
import {
  useMessageRecipients, useMessageIntern, useScheduleCall, type MessageRecipient,
} from '@/hooks/useAdminMessaging';

const apiErr = (e: unknown) =>
  ((e as { response?: { data?: { message?: string } } })?.response?.data?.message) ??
  'Something went wrong. Please try again.';

export default function AdminMessages() {
  const { data: recipients = [], isLoading } = useMessageRecipients();
  const message = useMessageIntern();
  const schedule = useScheduleCall();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MessageRecipient | null>(null);

  // Compose
  const [body, setBody] = useState('');
  const [msgDone, setMsgDone] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState<string | null>(null);

  // Schedule call
  const [when, setWhen] = useState('');
  const [topic, setTopic] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [callDone, setCallDone] = useState<string | null>(null);
  const [callErr, setCallErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [recipients, query]);

  const pick = (r: MessageRecipient) => {
    setSelected(r);
    setBody(''); setMsgDone(null); setMsgErr(null);
    setWhen(''); setTopic(''); setMeetLink(''); setCallDone(null); setCallErr(null);
  };

  const sendMessage = () => {
    if (!selected || !body.trim()) return;
    setMsgErr(null); setMsgDone(null);
    message.mutate({ placementId: selected.placementId, body: body.trim() }, {
      onSuccess: (res) => { setMsgDone(`Sent — also emailed ${res.emailedTo}.`); setBody(''); },
      onError: (e) => setMsgErr(apiErr(e)),
    });
  };

  const sendSchedule = () => {
    if (!selected || !when || !topic.trim() || !meetLink.trim()) return;
    setCallErr(null); setCallDone(null);
    schedule.mutate(
      { placementId: selected.placementId, scheduledAt: new Date(when).toISOString(), topic: topic.trim(), meetLink: meetLink.trim() },
      {
        onSuccess: (res) => { setCallDone(`Invite sent — emailed ${res.emailedTo}.`); setWhen(''); setTopic(''); setMeetLink(''); },
        onError: (e) => setCallErr(apiErr(e)),
      },
    );
  };

  const input = 'w-full rounded-lg border border-[var(--h-c4c5d5)] bg-[var(--h-ffffff)] px-3 py-2 text-sm text-[var(--h-0b1c30)] placeholder-[var(--h-94a3b8)] focus:border-[var(--h-15157d)] focus:outline-none focus:ring-1 focus:ring-[var(--h-15157d)]';
  const meetValid = /^https?:\/\//i.test(meetLink.trim());

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--h-0b1c30)]">
          <MessageSquareText className="h-5 w-5 text-[var(--h-15157d)]" /> Messages
        </h1>
        <p className="mt-0.5 text-sm text-[var(--h-757684)]">Message an intern (in-app + email), or schedule a Google Meet call.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Recipients */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)]">
            <div className="border-b border-[var(--h-e2e6ef)] p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--h-94a3b8)]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search interns…" className={`${input} pl-8`} />
              </div>
            </div>
            <div className="max-h-[64vh] overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[var(--h-15157d)]" /></div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[var(--h-94a3b8)]">No active interns.</p>
              ) : filtered.map((r) => (
                <button
                  key={r.placementId} onClick={() => pick(r)}
                  className={`block w-full border-b border-[var(--h-f0f2f7)] px-4 py-3 text-left transition-colors last:border-0 ${
                    selected?.placementId === r.placementId ? 'bg-[var(--h-f1ecff)]' : 'hover:bg-[var(--h-f8f9ff)]'
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-[var(--h-0b1c30)]">{r.name}</p>
                  <p className="truncate text-xs text-[var(--h-64748b)]">{r.email}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Composer */}
        <section>
          {!selected ? (
            <div className="rounded-xl border border-dashed border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] py-24 text-center">
              <Mail className="mx-auto mb-3 h-10 w-10 text-[var(--h-cbd2e0)]" />
              <p className="text-sm text-[var(--h-64748b)]">Pick an intern to message or schedule a call.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                <h2 className="text-base font-bold text-[var(--h-0b1c30)]">{selected.name}</h2>
                <p className="text-sm text-[var(--h-64748b)]">{selected.email}{selected.company ? ` · ${selected.company}` : ''}</p>
              </div>

              {/* Message */}
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                <h3 className="mb-3 text-sm font-semibold text-[var(--h-0b1c30)]">Send a message</h3>
                <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message… (delivered in-app and to their email)" className={`${input} resize-none`} />
                {msgErr && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]"><AlertCircle className="h-4 w-4" /> {msgErr}</p>}
                {msgDone && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-1b7a45)]"><CheckCircle2 className="h-4 w-4" /> {msgDone}</p>}
                <div className="mt-3">
                  <button onClick={sendMessage} disabled={!body.trim() || message.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-15157d)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                    {message.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message
                  </button>
                </div>
              </div>

              {/* Schedule call */}
              <div className="rounded-xl border border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--h-0b1c30)]">
                  <Video className="h-4 w-4 text-[var(--h-15157d)]" /> Schedule a video call
                </h3>
                <p className="mb-3 text-xs text-[var(--h-757684)]">
                  Create the room on Google Meet, paste the link, and we email the time + link to {selected.name.split(' ')[0]}.
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
                {callErr && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-b3261e)]"><AlertCircle className="h-4 w-4" /> {callErr}</p>}
                {callDone && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--h-1b7a45)]"><CheckCircle2 className="h-4 w-4" /> {callDone}</p>}
                <div className="mt-3">
                  <button onClick={sendSchedule} disabled={!when || !topic.trim() || !meetValid || schedule.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--h-1b7a45)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                    {schedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} Send call invite
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

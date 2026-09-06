import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useThread, useSendMessage } from '@/hooks/useMessages';

const ROLE_LABELS: Record<string, string> = {
  student:             'Student',
  academic_supervisor: 'Supervisor',
  coordinator:         'Coordinator',
  admin:               'Admin',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Two-way message thread for a placement. Self-contained: shows the optional
 * header, the scrollable conversation, and the composer. Used in the Feedback
 * Center (reviewer + student) and the notification reply dialog.
 */
export function ChatThread({
  placementId,
  title,
  subtitle,
  initials,
  disabled,
}: {
  placementId: string | undefined;
  title?: string;
  subtitle?: string;
  initials?: string;
  disabled?: boolean;
}) {
  const { data: messages = [], isLoading } = useThread(placementId);
  const send = useSendMessage(placementId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function onSend() {
    const body = text.trim();
    if (!body || !placementId || send.isPending) return;
    try {
      await send.mutateAsync(body);
      setText('');
    } catch { /* surfaced below */ }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {title && (
        <div className="flex items-center gap-3 border-b border-line bg-brand-soft p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">
            {initials ?? title.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-ink">{title}</h4>
            {subtitle && <p className="truncate text-xs text-ink-secondary">{subtitle}</p>}
          </div>
        </div>
      )}

      <div className="flex-grow space-y-3 overflow-y-auto bg-surface-sunken/50 p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand-ink" />
          </div>
        ) : messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-ink-muted">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.mine ? 'ml-auto flex max-w-[85%] justify-end' : 'flex max-w-[85%]'}>
              <div
                className={
                  m.mine
                    ? 'rounded-2xl rounded-tr-none bg-brand p-3 text-white shadow-sm'
                    : 'rounded-2xl rounded-tl-none bg-brand-soft p-3'
                }
              >
                {!m.mine && (
                  <p className="mb-0.5 text-[11px] font-semibold text-brand-ink">
                    {m.senderName}
                    <span className="ml-1 font-normal text-ink-secondary">· {ROLE_LABELS[m.senderRole] ?? m.senderRole}</span>
                  </p>
                )}
                <p className={m.mine ? 'whitespace-pre-wrap text-sm' : 'whitespace-pre-wrap text-sm text-ink'}>{m.body}</p>
                <span className={m.mine ? 'mt-1 block text-right text-[10px] text-brand-ink' : 'mt-1 block text-[10px] text-ink-secondary'}>
                  {fmtTime(m.createdAt)}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        {send.isError && <p className="mb-2 text-xs text-danger">Couldn't send. Please try again.</p>}
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={text}
            disabled={disabled || !placementId}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={disabled ? 'Read-only' : 'Type a message…  (Enter to send)'}
            className="max-h-32 flex-grow resize-none rounded-2xl border border-line bg-surface px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          />
          <button
            onClick={onSend}
            disabled={disabled || !placementId || !text.trim() || send.isPending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
            aria-label="Send message"
          >
            {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

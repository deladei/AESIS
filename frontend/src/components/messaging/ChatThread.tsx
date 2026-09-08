import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Plus, Smile, X, FileText, Paperclip } from 'lucide-react';
import { useThread, useSendMessage } from '@/hooks/useMessages';
import { useClickOutside } from '@/hooks/useClickOutside';
import { ROLE_LABELS } from '@/lib/roles';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Mirrors the server's allow-list (messages.router).
const FILE_ACCEPT = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

/**
 * A small, deliberate set rather than a picker library.
 *
 * This is a supervision thread, not a chat app — the useful emoji are the ones
 * that acknowledge, encourage or flag. A full picker would be a dependency and
 * a scrolling grid nobody needs here.
 */
const EMOJI = [
  '👍', '🙏', '👏', '✅', '🎉', '💡', '🔥', '💪',
  '🙂', '😄', '🤔', '😅', '👀', '📌', '⏰', '⚠️',
  '❤️', '✨', '📎', '📝', '🚀', '☑️', '❓', '❗',
];

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
  const [files, setFiles] = useState<File[]>([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const emojiRef = useClickOutside<HTMLDivElement>(() => setShowEmoji(false));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // A file with no caption is a normal thing to send, so either one is enough.
  const canSend = !!placementId && !send.isPending && (text.trim().length > 0 || files.length > 0);

  async function onSend() {
    if (!canSend) return;
    try {
      await send.mutateAsync({ body: text.trim(), files });
      setText('');
      setFiles([]);
      setFileErr(null);
    } catch { /* surfaced below */ }
  }

  function addFiles(picked: FileList | null) {
    if (!picked?.length) return;
    setFileErr(null);
    const next: File[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_BYTES) { setFileErr(`${f.name} is over 10 MB.`); continue; }
      next.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MAX_FILES) {
        setFileErr(`Up to ${MAX_FILES} files per message.`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });
  }

  /** Insert at the caret rather than appending — the emoji usually belongs
   *  mid-sentence, and clobbering the caret is the classic picker bug. */
  function insertEmoji(emoji: string) {
    const el = textRef.current;
    if (!el) { setText((t) => t + emoji); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
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
                    ? 'rounded-card rounded-tr-none bg-brand p-3 text-white shadow-card'
                    : 'rounded-card rounded-tl-none bg-brand-soft p-3'
                }
              >
                {!m.mine && (
                  <p className="mb-0.5 text-[11px] font-semibold text-brand-ink">
                    {m.senderName}
                    <span className="ml-1 font-normal text-ink-secondary">· {ROLE_LABELS[m.senderRole] ?? m.senderRole}</span>
                  </p>
                )}
                {m.body && (
                  <p className={m.mine ? 'whitespace-pre-wrap text-sm' : 'whitespace-pre-wrap text-sm text-ink'}>{m.body}</p>
                )}
                {(m.attachments ?? []).length > 0 && (
                  <div className={m.body ? 'mt-2 space-y-1.5' : 'space-y-1.5'}>
                    {(m.attachments ?? []).map((a) => (
                      a.kind === 'image' ? (
                        <a key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={a.fileUrl} alt={a.fileName}
                            className="max-h-56 w-auto rounded-lg border border-line object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          key={a.id} href={a.fileUrl} target="_blank" rel="noopener noreferrer"
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium ${
                            m.mine ? 'border-white/30 text-white' : 'border-line bg-surface text-ink'
                          }`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{a.fileName}</span>
                        </a>
                      )
                    ))}
                  </div>
                )}
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
        {fileErr && <p className="mb-2 text-xs text-warn">{fileErr}</p>}

        {/* Staged files — removable before sending, so a mis-pick is not a
            message you have to un-send. */}
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-line bg-surface-sunken px-2 py-1 text-xs text-ink-secondary"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="shrink-0 text-ink-muted hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || !placementId}
            aria-label="Attach a file"
            title="Attach a file"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-secondary transition-colors enabled:hover:border-brand enabled:hover:text-brand-ink disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
          </button>
          <input
            ref={fileRef} type="file" multiple accept={FILE_ACCEPT} className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />

          <div className="relative" ref={emojiRef}>
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              disabled={disabled || !placementId}
              aria-label="Insert an emoji"
              aria-expanded={showEmoji}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-secondary transition-colors enabled:hover:border-brand enabled:hover:text-brand-ink disabled:opacity-50"
            >
              <Smile className="h-5 w-5" />
            </button>
            {showEmoji && (
              <div className="absolute bottom-12 left-0 z-30 grid w-64 grid-cols-8 gap-1 rounded-card border border-line bg-surface p-2 shadow-pop">
                {EMOJI.map((e) => (
                  <button
                    key={e} type="button"
                    onClick={() => { insertEmoji(e); setShowEmoji(false); }}
                    className="grid h-7 w-7 place-items-center rounded-md text-base hover:bg-surface-sunken"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            ref={textRef}
            rows={1}
            value={text}
            disabled={disabled || !placementId}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={disabled ? 'Read-only' : 'Type a message…  (Enter to send)'}
            className="max-h-32 flex-grow resize-none rounded-card border border-line bg-surface px-4 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
          />
          <button
            onClick={onSend}
            disabled={disabled || !canSend}
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

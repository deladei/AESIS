import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Loader2, Inbox } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  useNotifications, useUnreadCount, useMarkRead, useMarkAllRead, type Notification,
} from '@/hooks/useNotifications';

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * Coordinator notification bell (item 19) — unread badge, dropdown of recent
 * events (placement requests, overdue interns, supervisor assignments…),
 * mark-read on open of an item, mark-all-read, and a deep-link to the source
 * via the notification's `link`.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const navigate = useNavigate();

  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifications = [], isLoading } = useNotifications(false);
  const markRead = useMarkRead();
  const markAll  = useMarkAllRead();

  const onOpen = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-ink-secondary transition-colors hover:bg-brand-soft"
        aria-label="Notifications" aria-haspopup="true" aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-card border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="text-sm font-bold text-ink">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand-ink" /></div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Inbox className="h-6 w-6 text-ink-muted" />
                <p className="text-sm text-ink-muted">You're all caught up.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onOpen(n)}
                  className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-brand-soft ${n.isRead ? '' : 'bg-surface-sunken'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-brand'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{n.title}</span>
                    <span className="block text-xs text-ink-secondary line-clamp-2">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-muted">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

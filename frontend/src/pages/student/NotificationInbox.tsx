import { useEffect } from 'react';
import { Bell, AlertTriangle, MessageSquare, CheckCircle2, FileText, Clock, Loader2 } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useUnreadCount } from '@/hooks/useNotifications';
import { getSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

const notifConfig: Record<string, { icon: React.ElementType; iconClass: string; bg: string }> = {
  risk_alert:           { icon: AlertTriangle,  iconClass: 'text-[var(--h-b3261e)]', bg: 'bg-[var(--h-ffe2dc)] border-[var(--h-f5b8ad)]' },
  feedback_received:    { icon: MessageSquare,  iconClass: 'text-[var(--h-15157d)]', bg: 'bg-[var(--h-e1e8ff)] border-[var(--h-bcc8ff)]' },
  submission_reminder:  { icon: Clock,          iconClass: 'text-[var(--h-9a6700)]', bg: 'bg-[var(--h-fff4e0)] border-[var(--h-f3d690)]' },
  placement_approved:   { icon: CheckCircle2,   iconClass: 'text-[var(--h-1b7a45)]', bg: 'bg-[var(--h-dcf5e6)] border-[var(--h-aee3c2)]' },
  escalation:           { icon: AlertTriangle,  iconClass: 'text-[var(--h-b45309)]', bg: 'bg-[var(--h-ffedd5)] border-[var(--h-fed7aa)]' },
  system:               { icon: FileText,       iconClass: 'text-[var(--h-64748b)]', bg: 'bg-[var(--h-eef0f5)] border-[var(--h-d8dce6)]' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000)     return 'Just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationInbox() {
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: unread = 0 } = useUnreadCount();
  const markRead    = useMarkRead();
  const markAllRead = useMarkAllRead();

  // Live push: invalidate list when socket fires
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--h-8a4cfc)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[var(--h-0b1c30)]">Notifications</h1>
          {unread > 0 && (
            <span className="rounded-full border border-[var(--h-bcc8ff)] bg-[var(--h-e1e8ff)] px-2 py-0.5 font-mono text-xs text-[var(--h-15157d)]">
              {unread} unread
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="cursor-pointer text-xs font-medium text-[var(--h-712ae2)] transition-colors hover:text-[var(--h-5a1fc0)] disabled:opacity-60"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--h-d8dce6)] bg-[var(--h-ffffff)] py-20 text-center">
          <Bell className="mb-4 h-10 w-10 text-[var(--h-cbd2e0)]" />
          <p className="text-sm text-[var(--h-64748b)]">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = notifConfig[n.type] ?? notifConfig.system;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                className={`flex cursor-pointer items-start gap-4 rounded-xl border px-5 py-4 transition-colors ${
                  n.isRead
                    ? 'border-[var(--h-e2e6ef)] bg-[var(--h-ffffff)] hover:bg-[var(--h-f8f9ff)]'
                    : 'border-[var(--h-bcc8ff)] bg-[var(--h-f4f6ff)] hover:bg-[var(--h-eef2ff)]'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className={`text-sm font-semibold ${n.isRead ? 'text-[var(--h-464652)]' : 'text-[var(--h-0b1c30)]'}`}>
                      {n.title}
                    </p>
                    {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--h-15157d)]" />}
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--h-64748b)]">{n.body}</p>
                </div>
                <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-[var(--h-94a3b8)]">
                  {formatDate(n.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

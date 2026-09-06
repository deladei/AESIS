import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, MessageSquare, CheckCircle2, FileText, Clock, Reply, X, CheckCheck } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useUnreadCount } from '@/hooks/useNotifications';
import { getSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';
import { ChatThread } from '@/components/messaging/ChatThread';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonRows } from '@/components/ui/Feedback';

const notifConfig: Record<string, { icon: React.ElementType; iconClass: string; bg: string }> = {
  risk_alert:           { icon: AlertTriangle,  iconClass: 'text-danger', bg: 'bg-danger-soft border-danger' },
  feedback_received:    { icon: MessageSquare,  iconClass: 'text-brand-ink', bg: 'bg-brand-soft border-brand' },
  submission_reminder:  { icon: Clock,          iconClass: 'text-warn', bg: 'bg-warn-soft border-warn' },
  placement_approved:   { icon: CheckCircle2,   iconClass: 'text-ok', bg: 'bg-ok-soft border-ok' },
  escalation:           { icon: AlertTriangle,  iconClass: 'text-warn', bg: 'bg-warn-soft border-warn' },
  system:               { icon: FileText,       iconClass: 'text-ink-secondary', bg: 'bg-surface-sunken border-line' },
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
  // Open reply dialog for a message notification (carries the thread placementId).
  const [replyTo, setReplyTo] = useState<{ placementId: string; who: string } | null>(null);

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
    return <div className="mx-auto max-w-3xl p-4 sm:p-6"><Card><SkeletonRows rows={5} /></Card></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-ink">
            Notifications
            {unread > 0 && <Badge tone="brand">{unread} unread</Badge>}
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Reminders, feedback and decisions on your placement.
          </p>
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary transition-colors enabled:hover:border-brand enabled:hover:text-brand-ink disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </header>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            hint="Deadline reminders, supervisor feedback and placement decisions land here."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const cfg = notifConfig[n.type] ?? notifConfig.system;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}
                className={`flex cursor-pointer items-start gap-4 rounded-card border px-5 py-4 shadow-card transition-colors ${
                  n.isRead
                    ? 'border-line bg-surface hover:bg-surface-sunken'
                    : 'border-brand bg-surface-sunken'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className={`text-sm font-semibold ${n.isRead ? 'text-ink-secondary' : 'text-ink'}`}>
                      {n.title}
                    </p>
                    {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                  </div>
                  <p className="text-xs leading-relaxed text-ink-secondary">{n.body}</p>
                  {n.metadata?.kind === 'message' && n.metadata.placementId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.isRead) markRead.mutate(n.id);
                        setReplyTo({ placementId: n.metadata!.placementId!, who: n.metadata!.senderName ?? 'your mentor' });
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand bg-surface px-2.5 py-1 text-xs font-semibold text-brand-ink hover:bg-surface-sunken"
                    >
                      <Reply className="h-3.5 w-3.5" /> Reply
                    </button>
                  )}
                </div>
                <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs text-ink-muted">
                  {formatDate(n.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply dialog — same two-way thread used in the Feedback Center */}
      {replyTo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setReplyTo(null)}
        >
          <div
            className="flex h-[600px] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h3 className="text-sm font-bold text-brand-ink">Reply to {replyTo.who}</h3>
              <button onClick={() => setReplyTo(null)} className="text-ink-muted hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatThread placementId={replyTo.placementId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

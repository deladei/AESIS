import { useEffect } from 'react';
import { Bell, AlertTriangle, MessageSquare, CheckCircle2, FileText, Clock, Loader2 } from 'lucide-react';
import { useNotifications, useMarkRead, useMarkAllRead, useUnreadCount } from '@/hooks/useNotifications';
import { getSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

const notifConfig: Record<string, { icon: React.ElementType; iconClass: string; bg: string }> = {
  risk_alert:           { icon: AlertTriangle,  iconClass: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  feedback_received:    { icon: MessageSquare,  iconClass: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  submission_reminder:  { icon: Clock,          iconClass: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  placement_approved:   { icon: CheckCircle2,   iconClass: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20' },
  escalation:           { icon: AlertTriangle,  iconClass: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
  system:               { icon: FileText,       iconClass: 'text-slate-400',  bg: 'bg-slate-700/50 border-slate-600' },
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
      <div className="p-6 flex justify-center items-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          {unread > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600/30 border border-blue-600/40 text-blue-300 font-mono">
              {unread} unread
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer disabled:opacity-60"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-10 h-10 text-slate-700 mb-4" />
          <p className="text-slate-500 text-sm">No notifications yet</p>
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
                className={`flex items-start gap-4 px-5 py-4 rounded-xl border transition-colors cursor-pointer ${
                  n.isRead
                    ? 'bg-slate-900 border-slate-800 hover:bg-slate-800/50'
                    : 'bg-slate-900 border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.iconClass}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-semibold ${n.isRead ? 'text-slate-300' : 'text-white'}`}>
                      {n.title}
                    </p>
                    {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{n.body}</p>
                </div>
                <span className="text-xs text-slate-600 shrink-0 whitespace-nowrap mt-0.5">
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

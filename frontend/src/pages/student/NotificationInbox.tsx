import { useState } from 'react';
import { Bell, AlertTriangle, MessageSquare, CheckCircle2, FileText, Clock } from 'lucide-react';

type NotifType = 'risk_alert' | 'feedback_received' | 'submission_reminder' | 'placement_approved' | 'escalation';

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

const notifConfig: Record<NotifType, { icon: React.ElementType; iconClass: string; bg: string }> = {
  risk_alert:           { icon: AlertTriangle,  iconClass: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  feedback_received:    { icon: MessageSquare,  iconClass: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
  submission_reminder:  { icon: Clock,          iconClass: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  placement_approved:   { icon: CheckCircle2,   iconClass: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20' },
  escalation:           { icon: AlertTriangle,  iconClass: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
};

const initialNotifs: Notification[] = [
  { id: '1', type: 'feedback_received',   title: 'New feedback from Dr. Emeka Obi', body: 'Your Week 8 logbook has been reviewed. Feedback submitted.', isRead: false, createdAt: '2 hours ago', link: '/student/logbook/8' },
  { id: '2', type: 'submission_reminder', title: 'Week 9 logbook due in 3 days',    body: 'Remember to submit your logbook by Friday 16 May 2025 at 23:59.', isRead: false, createdAt: '6 hours ago' },
  { id: '3', type: 'placement_approved',  title: 'Placement approved',              body: 'Your placement at TechBridge Ltd has been approved. Your logbook schedule is now active.', isRead: true, createdAt: '2 days ago' },
  { id: '4', type: 'feedback_received',   title: 'New feedback from Dr. Emeka Obi', body: 'Your Week 7 logbook has been reviewed.', isRead: true, createdAt: '1 week ago' },
  { id: '5', type: 'submission_reminder', title: 'Week 8 logbook due tomorrow',     body: 'Submit your Week 8 logbook by Friday 9 May 2025 at 23:59.', isRead: true, createdAt: '1 week ago' },
];

export default function NotificationInbox() {
  const [notifications, setNotifications] = useState(initialNotifs);
  const unread = notifications.filter((n) => !n.isRead).length;

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

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
            onClick={markAllRead}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
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
            const cfg = notifConfig[n.type];
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
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
                <span className="text-xs text-slate-600 shrink-0 whitespace-nowrap mt-0.5">{n.createdAt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

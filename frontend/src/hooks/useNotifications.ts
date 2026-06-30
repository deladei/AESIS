import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface Notification {
  id:        string;
  type:      string;
  title:     string;
  body:      string;
  isRead:    boolean;
  link:      string | null;
  createdAt: string;
  metadata?: { kind?: string; placementId?: string; senderName?: string } | null;
}

const KEYS = {
  list:  (unreadOnly?: boolean) => ['notifications', { unreadOnly }],
  count: () => ['notifications', 'unread-count'],
};

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: KEYS.list(unreadOnly),
    queryFn:  async () => {
      const r = await api.get<{ data: { notifications: Notification[] } }>(
        `/notifications?unreadOnly=${unreadOnly}&limit=50`,
      );
      return r.data.data.notifications;
    },
  });
}

export function useUnreadCount() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEYS.count(),
    queryFn:  async () => {
      const r = await api.get<{ data: { count: number } }>('/notifications/unread-count');
      return r.data.data.count;
    },
    refetchInterval: 60_000, // fallback polling every 60 s
  });

  // Subscribe to socket push for instant badge update
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = () => {
      qc.invalidateQueries({ queryKey: KEYS.count() });
      qc.invalidateQueries({ queryKey: KEYS.list() });
    };

    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, [qc]);

  return query;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.count() });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.count() });
    },
  });
}

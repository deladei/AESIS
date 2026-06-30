import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface Message {
  id:         string;
  body:       string;
  createdAt:  string;
  senderId:   string;
  senderName: string;
  senderRole: string;
  mine:       boolean;
}

// Live message thread for a placement. Polls as a fallback and also refetches
// instantly when a message notification pushes over the socket.
export function useThread(placementId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', placementId],
    enabled:  !!placementId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const r = await api.get<{ data: { messages: Message[] } }>(`/placements/${placementId}/messages`);
      return r.data.data.messages;
    },
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !placementId) return;
    const handler = (payload: unknown) => {
      const p = payload as { kind?: string; placementId?: string } | undefined;
      if (p?.kind === 'message' && (!p.placementId || p.placementId === placementId)) {
        qc.invalidateQueries({ queryKey: ['messages', placementId] });
      }
    };
    socket.on('notification:new', handler);
    return () => { socket.off('notification:new', handler); };
  }, [placementId, qc]);

  return query;
}

export function useSendMessage(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const r = await api.post<{ data: { message: Message } }>(
        `/placements/${placementId}/messages`, { body },
      );
      return r.data.data.message;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', placementId] });
    },
  });
}

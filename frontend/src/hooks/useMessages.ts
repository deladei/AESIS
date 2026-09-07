import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export interface MessageAttachment {
  id:       string;
  fileUrl:  string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  kind:     'image' | 'document';
}

export interface Message {
  id:         string;
  body:       string;
  createdAt:  string;
  senderId:   string;
  senderName: string;
  senderRole: string;
  mine:       boolean;
  attachments?: MessageAttachment[];
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
    /** Multipart so a caption and its file are ONE message, not two. */
    mutationFn: async ({ body, files }: { body: string; files?: File[] }) => {
      const form = new FormData();
      form.append('body', body);
      for (const f of files ?? []) form.append('files', f);
      const r = await api.post<{ data: { message: Message } }>(
        `/placements/${placementId}/messages`,
        form,
        // `undefined` so the browser sets the multipart boundary itself.
        { headers: { 'Content-Type': undefined } },
      );
      return r.data.data.message;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', placementId] });
    },
  });
}

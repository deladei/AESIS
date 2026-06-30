import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface MessageRecipient {
  placementId: string;
  name: string;
  email: string;
  company: string | null;
}

export function useMessageRecipients() {
  return useQuery({
    queryKey: ['admin', 'messaging', 'recipients'],
    queryFn: async () => {
      const r = await api.get<{ data: MessageRecipient[] }>('/admin/messaging/recipients');
      return r.data.data;
    },
  });
}

export function useMessageIntern() {
  return useMutation({
    mutationFn: async ({ placementId, body }: { placementId: string; body: string }) => {
      const r = await api.post<{ data: { ok: boolean; emailedTo: string } }>(
        `/admin/messaging/${placementId}/message`, { body },
      );
      return r.data.data;
    },
  });
}

export interface ScheduleCallArgs {
  placementId: string;
  scheduledAt: string; // ISO
  topic: string;
  meetLink: string;
}

export function useScheduleCall() {
  return useMutation({
    mutationFn: async ({ placementId, ...input }: ScheduleCallArgs) => {
      const r = await api.post<{ data: { ok: boolean; emailedTo: string } }>(
        `/admin/messaging/${placementId}/schedule-call`, input,
      );
      return r.data.data;
    },
  });
}

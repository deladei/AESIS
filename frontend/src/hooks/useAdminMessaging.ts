import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

// The one-way message composer retired with /admin/messages — the Feedback
// Center's ChatThread (two-way, in-app + email fan-out) replaced it. Only the
// call scheduler survives, rendered in the Feedback Center for admins.

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

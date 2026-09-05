import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type VisitType = 'site_visit' | 'review_meeting' | 'midterm_review' | 'final_review' | 'check_in';

export interface Visit {
  id:              string;
  placementId:     string;
  scheduledAt:     string;
  durationMinutes: number;
  visitType:       VisitType;
  location:        string | null;
  notes:           string | null;
  completed:       boolean;
  completedAt:     string | null;
  outcomeNote:     string | null;
  placement: {
    id: string;
    student: { id: string; firstName: string; lastName: string };
    company: { name: string } | null;
  };
  supervisor: { id: string; firstName: string; lastName: string };
}

const KEY = ['visits'] as const;

/** Scheduled reviews. The API scopes by role — a student only ever sees theirs. */
export function useVisits(opts: { upcomingOnly?: boolean; placementId?: string } = {}) {
  return useQuery({
    queryKey: [...KEY, opts.placementId ?? 'all', opts.upcomingOnly ?? false],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.placementId) params.set('placementId', opts.placementId);
      if (opts.upcomingOnly) params.set('upcomingOnly', 'true');
      const qs = params.toString();
      const r = await api.get<{ data: Visit[] }>(`/visits${qs ? `?${qs}` : ''}`);
      return r.data.data;
    },
  });
}

export function useScheduleVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      placementId: string; scheduledAt: string; visitType?: VisitType;
      durationMinutes?: number; location?: string; notes?: string;
    }) => (await api.post<{ data: Visit }>('/visits', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['supervisor', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['student', 'dashboard'] });
    },
  });
}

export function useCompleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcomeNote }: { id: string; outcomeNote?: string }) =>
      (await api.post<{ data: Visit }>(`/visits/${id}/complete`, { outcomeNote })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Placement {
  id:              string;
  placementStatus: string;
  studentId:       string;
  student?:        { firstName: string; lastName: string; email: string };
  company?:        { name: string };
  startDate:       string | null;
  endDate:         string | null;
  createdAt:       string;
}

export function useMyPlacements() {
  return useQuery({
    queryKey: ['placements', 'mine'],
    queryFn:  async () => {
      const r = await api.get<{ data: Placement[] }>('/placements/mine');
      return r.data.data;
    },
  });
}

export function useAllPlacements(page = 1, status?: string) {
  return useQuery({
    queryKey: ['placements', 'all', { page, status }],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      const r = await api.get<{ data: { placements: Placement[]; meta: unknown } }>(
        `/placements?${params}`,
      );
      return r.data.data;
    },
  });
}

export function useUpdatePlacementStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, placementStatus, rejectionReason }: {
      id: string; placementStatus: string; rejectionReason?: string;
    }) => api.patch(`/placements/${id}/status`, { placementStatus, rejectionReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
    },
  });
}

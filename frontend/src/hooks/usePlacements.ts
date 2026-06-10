import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlacementSupervisor {
  id:        string;
  firstName: string;
  lastName:  string;
}

export type FinalizationStatus = 'active' | 'assessment_pending' | 'finalized';

export interface Placement {
  id:                   string;
  placementStatus:      string;
  finalizationStatus?:  FinalizationStatus;
  studentId:            string;
  student?:             { id?: string; firstName: string; lastName: string; email: string };
  company?:             { name: string };
  academicSupervisor?:  PlacementSupervisor | null;
  startDate:            string | null;
  endDate:              string | null;
  createdAt:            string;
}

export interface Supervisor {
  id:        string;
  firstName: string;
  lastName:  string;
  email:     string;
}

export function useMyPlacements() {
  return useQuery({
    queryKey: ['placements', 'mine'],
    queryFn:  async () => {
      const r = await api.get<{ data: Placement[] | { placements?: Placement[] } }>('/placements/mine');
      // Normalize to an array regardless of payload shape: the endpoint returns
      // a bare array, but tolerate a paginated `{ placements }` envelope or any
      // unexpected/cold-start body so callers can always `.find`/`.map` safely.
      const d = r.data?.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        return (d as { placements: Placement[] }).placements;
      }
      return [] as Placement[];
    },
  });
}

/** Placements assigned to the logged-in academic supervisor. */
export function useAssignedPlacements() {
  return useQuery({
    queryKey: ['placements', 'assigned'],
    queryFn:  async () => {
      const r = await api.get<{ data: Placement[] | { placements?: Placement[] } }>('/placements/assigned');
      const d = r.data?.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        return (d as { placements: Placement[] }).placements;
      }
      return [] as Placement[];
    },
  });
}

export function useAllPlacements(page = 1, status?: string) {
  return useQuery({
    queryKey: ['placements', 'all', { page, status }],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      const r = await api.get<{
        data: Placement[] | { placements?: Placement[]; meta?: unknown };
        meta?: unknown;
      }>(`/placements?${params}`);
      // The endpoint returns a bare `data` array with `meta` as a sibling. Normalize
      // to `{ placements, meta }` so callers can `?.placements` safely; also tolerate
      // a nested `{ placements, meta }` envelope or any cold-start/error body.
      const d = r.data?.data;
      if (Array.isArray(d)) {
        return { placements: d, meta: r.data?.meta };
      }
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        const env = d as { placements: Placement[]; meta?: unknown };
        return { placements: env.placements, meta: env.meta };
      }
      return { placements: [] as Placement[], meta: undefined };
    },
  });
}

/** Academic supervisors available for assignment (coordinator/admin only). */
export function useSupervisors() {
  return useQuery({
    queryKey: ['coordinator', 'supervisors'],
    queryFn:  async () => {
      const r = await api.get<{ data: Supervisor[] }>('/coordinator/supervisors');
      return r.data.data;
    },
  });
}

export function useUpdatePlacementStatus() {
  const qc = useQueryClient();
  return useMutation({
    // Backend expects `status` (+ optional supervisorId on approval, rejectionReason on reject)
    mutationFn: ({ id, status, supervisorId, rejectionReason }: {
      id: string; status: string; supervisorId?: string; rejectionReason?: string;
    }) => api.patch(`/placements/${id}/status`, { status, supervisorId, rejectionReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
    },
  });
}

/** Assign or reassign the academic supervisor on any placement. */
export function useAssignSupervisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, supervisorId }: { id: string; supervisorId: string }) =>
      api.patch(`/placements/${id}/supervisor`, { supervisorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
    },
  });
}

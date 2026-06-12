import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CohortConfig {
  id:                string;
  minWeeklyHours:    number;
  totalWeeks:        number;
  academicYearId:    string;
  academicYearLabel: string;
}

/** Cohort configuration for the active academic year (coordinator/admin only). */
export function useCohortConfig(enabled = true) {
  return useQuery({
    queryKey: ['coordinator', 'cohort-config'],
    enabled,
    queryFn: async () => {
      const r = await api.get<{ data: CohortConfig }>('/coordinator/cohort-config');
      return r.data.data;
    },
  });
}

/**
 * Set the active cohort's per-week minimum attendance hours. On success we both
 * prime the config cache and invalidate the intern dashboard so the attendance
 * tile (logged vs target) reflects the new minimum immediately.
 */
export function useUpdateCohortConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { minWeeklyHours: number }) => {
      const r = await api.patch<{ data: CohortConfig }>('/coordinator/cohort-config', input);
      return r.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['coordinator', 'cohort-config'], data);
      qc.invalidateQueries({ queryKey: ['student', 'dashboard'] });
    },
  });
}

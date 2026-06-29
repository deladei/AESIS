import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CohortConfig {
  id:                   string;
  minWeeklyHours:       number;
  performanceThreshold: number;   // quality score below which an intern flags as at-risk (0 = off)
  totalWeeks:           number;
  weightIndustry:       number;   // final-grade aggregation weights (% points, sum to 100)
  weightUniversity:     number;
  weightReport:         number;
  weightLogbook:        number;
  academicYearId:       string;
  academicYearLabel:    string;
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
    mutationFn: async (input: {
      minWeeklyHours?: number;
      performanceThreshold?: number;
      weightIndustry?: number;
      weightUniversity?: number;
      weightReport?: number;
      weightLogbook?: number;
    }) => {
      const r = await api.patch<{ data: CohortConfig }>('/coordinator/cohort-config', input);
      return r.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(['coordinator', 'cohort-config'], data);
      // The threshold drives the coordinator at-risk derivation; the hours drive
      // the intern attendance tile; the weights drive final-grade aggregation —
      // refresh the affected surfaces.
      qc.invalidateQueries({ queryKey: ['student', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
      qc.invalidateQueries({ queryKey: ['grade'] });
    },
  });
}

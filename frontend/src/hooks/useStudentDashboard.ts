import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface StudentDashboard {
  hasActivePlacement: boolean;
  week:               { current: number; total: number } | null;
  logsSubmitted:      number;
  expectedLogs:       number;
  completionPct:      number;
  avgQualityScore:    number | null;
}

/**
 * Server-computed intern dashboard stats. The average is a validated numeric
 * mean (never a string-concatenated score) and the week count is derived from
 * the placement's real dates, so neither can contradict what the UI shows.
 */
export function useStudentDashboard(enabled = true) {
  return useQuery({
    queryKey: ['student', 'dashboard'],
    enabled,
    queryFn:  async () => {
      const r = await api.get<{ data: StudentDashboard }>('/student/dashboard');
      return r.data.data;
    },
  });
}

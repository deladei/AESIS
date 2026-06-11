import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DashboardSupervisor {
  name:         string;
  email:        string;
  phone:        string | null;
  organization: string | null;
}

export interface StatusBreakdown {
  approved:          number; // acknowledged
  pendingReview:     number; // submitted
  revisionRequested: number; // returned
  rejected:          number; // rejected
  inProgress:        number; // draft
  total:             number;
}

export interface StudentDashboard {
  hasActivePlacement: boolean;
  week:               { current: number; total: number } | null;
  logsSubmitted:      number;
  expectedLogs:       number;
  completionPct:      number;
  avgQualityScore:    number | null;
  statusBreakdown:    StatusBreakdown;
  supervisors: {
    academic: DashboardSupervisor | null;
    company:  DashboardSupervisor | null;
  };
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

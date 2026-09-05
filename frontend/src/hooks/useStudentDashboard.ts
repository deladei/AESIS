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
  inProgress:        number; // draft
  total:             number;
}

export interface HoursSummary {
  logged:     number; // cumulative attendance hours on submitted+ entries
  expected:   number; // perWeekMin × expected weeks (0 = no minimum configured)
  perWeekMin: number; // the cohort's configured per-week minimum
  shortfall:  boolean; // expected > 0 && logged < expected
}

export interface ObjectiveProgressSummary {
  id:                  string;
  title:               string;
  confirmedEntryCount: number; // confirmed entry links only
}

export interface NextReview {
  id:              string;
  scheduledAt:     string;
  visitType:       string;
  location:        string | null;
  durationMinutes: number;
}

export interface StudentDashboard {
  hasActivePlacement: boolean;
  /** Derived at read time from the user's own fields — never a stored number. */
  profile: {
    academicLevel: number | null;
    completionPct: number;
    /** The student's own department; always set. Programme is optional. */
    department:    string | null;
    programme:     string | null;
  };
  nextReview:         NextReview | null;
  tasks:              { done: number; total: number };
  week:               { current: number; total: number } | null;
  logsSubmitted:      number;
  expectedLogs:       number;
  completionPct:      number;
  avgQualityScore:    number | null;
  statusBreakdown:    StatusBreakdown;
  hours:              HoursSummary;
  objectives:         ObjectiveProgressSummary[];
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

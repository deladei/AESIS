import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Coordinator ───────────────────────────────────────────────

export interface CoordinatorDashboard {
  overview: {
    activePlacements: number;
    pendingApprovals: number;
    complianceRate:   number;
    highRiskCount:    number;
  };
  riskDistribution: { low: number; medium: number; high: number };
  submissionTrends: { week: number; scheduled: number; submitted: number }[];
}

export function useCoordinatorDashboard() {
  return useQuery({
    queryKey: ['coordinator', 'dashboard'],
    queryFn:  async () => {
      const r = await api.get<{ data: CoordinatorDashboard }>('/coordinator/dashboard');
      return r.data.data;
    },
  });
}

export interface CoordinatorStudent {
  placementId:     string;
  student:         { id: string; firstName: string; lastName: string; email: string };
  riskTier:        'low' | 'medium' | 'high' | null;
  riskScore:       number | null;
  lastWeek:        number | null;
  lastStatus:      string | null;
  lastSubmittedAt: string | null;
}

export function useCoordinatorStudents(page = 1, riskTier?: 'low' | 'medium' | 'high') {
  return useQuery({
    queryKey: ['coordinator', 'students', { page, riskTier }],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (riskTier) params.set('riskTier', riskTier);
      const r = await api.get<{ data: { students: CoordinatorStudent[]; meta: unknown } }>(
        `/coordinator/students?${params}`,
      );
      return r.data.data;
    },
  });
}

// ── Supervisor ────────────────────────────────────────────────

export interface SupervisorDashboard {
  overview: {
    assignedStudents: number;
    pendingReview:    number;
    avgQualityScore:  number | null;
  };
  students: {
    placementId:     string;
    student:         { id: string; firstName: string; lastName: string; email: string };
    riskTier:        'low' | 'medium' | 'high' | null;
    riskScore:       number | null;
    recentWeeks:     { week: number; status: string; score: number | null }[];
    avgQualityScore: number | null;
    lastSubmittedAt: string | null;
  }[];
}

export function useSupervisorDashboard() {
  return useQuery({
    queryKey: ['supervisor', 'dashboard'],
    queryFn:  async () => {
      const r = await api.get<{ data: SupervisorDashboard }>('/supervisor/dashboard');
      return r.data.data;
    },
  });
}

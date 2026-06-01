import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Coordinator ───────────────────────────────────────────────

export interface CoordinatorDashboard {
  overview: {
    activePlacements: number;
    pendingApprovals: number;
    complianceRate:   number;
    highRiskCount:    number;
    avgPerformance:   number | null;
    partnerCompanies: number;
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
  department:      string | null;
  supervisor:      { id: string; name: string } | null;
  riskTier:        'low' | 'medium' | 'high' | null;
  riskScore:       number | null;
  lastWeek:        number | null;
  lastStatus:      string | null;
  lastSubmittedAt: string | null;
  totalWeeks:      number;
  submittedWeeks:  number;
  progressPct:     number;
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

export interface CoordinatorActivity {
  id:         string;
  action:     string;
  entityType: string;
  actor:      string;
  actorRole:  string;
  summary:    string;
  createdAt:  string;
}

export function useCoordinatorActivity(limit = 8) {
  return useQuery({
    queryKey: ['coordinator', 'activity', limit],
    queryFn:  async () => {
      const r = await api.get<{ data: CoordinatorActivity[] }>(
        `/coordinator/activity?limit=${limit}`,
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

// ── Admin ─────────────────────────────────────────────────────

export interface AdminDashboard {
  overview: {
    activeInterns:  number;
    pendingReviews: number;
    avgEngagement:  number;
  };
  pulseBoard: {
    placementId:   string;
    name:          string;
    department:    string | null;
    riskTier:      'low' | 'medium' | 'high' | null;
    submittedWeeks: number;
    totalWeeks:    number;
    engagementPct: number;
    feedbackCount: number;
  }[];
  recentSubmissions: {
    id:          string;
    internName:  string;
    weekNumber:  number;
    submittedAt: string | null;
    status:      string;
  }[];
  submissionCounts: { pending: number; reviewed: number };
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn:  async () => {
      const r = await api.get<{ data: AdminDashboard }>('/admin/dashboard');
      return r.data.data;
    },
  });
}

// ── AI Insights & Analytics ───────────────────────────────────

export interface InsightsData {
  overview: { activeInterns: number; flaggedCount: number };
  performanceMonitoring: {
    placementId:     string;
    name:            string;
    department:      string;
    engagementPct:   number;
    engagementLabel: string;
    submittedCount:  number;
    expectedWeeks:   number;
    successScore:    number | null;
    riskTier:        'low' | 'medium' | 'high' | null;
    status:          string;
    flagged:         boolean;
  }[];
  successTrend: { week: number; avgQuality: number }[];
  sentiment: { hasData: boolean; weeks: { week: number; polarity: number }[]; anomalyWeek: number | null };
  skillProfile: { hasData: boolean; dimensions: { dimension: string; avgScore: number | null }[] };
  actionableSummaries: { hasData: boolean; items: { title: string; body: string }[] };
}

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn:  async () => {
      const r = await api.get<{ data: InsightsData }>('/insights');
      return r.data.data;
    },
  });
}

export interface FeedbackIntern {
  placementId: string;
  studentId:   string;
  name:        string;
  company:     string | null;
  latestSubmission: {
    id:                 string;
    weekNumber:         number;
    status:             string;
    canReceiveFeedback: boolean;
    qualityScore:       number | null;
    sentimentClass:     string | null;
    aiFeedbackSummary:  string | null;
  } | null;
}

export function useFeedbackInterns() {
  return useQuery({
    queryKey: ['insights', 'interns'],
    queryFn:  async () => {
      const r = await api.get<{ data: FeedbackIntern[] }>('/insights/interns');
      return r.data.data;
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Coordinator ───────────────────────────────────────────────

export interface CoordinatorDashboard {
  overview: {
    activePlacements: number;
    pendingApprovals: number;
    complianceRate:   number;
    highRiskCount:    number;
    avgPerformance:   number | null;
    hostCompanies:    number;
  };
  riskDistribution: { low: number; medium: number; high: number };
  submissionTrends: { week: number; scheduled: number; submitted: number }[];
  featureFlags:     { aiPulseMatching: boolean };
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

export type StudentSortKey = 'name' | 'department' | 'supervisor' | 'progress' | 'score' | 'status';
export type StudentStatusFilter =
  | 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'rejected' | 'not_started';

export interface StudentListParams {
  page?:           number;
  limit?:          number;
  riskTier?:       'low' | 'medium' | 'high';
  status?:         StudentStatusFilter;
  programmeId?:    string;
  supervisorId?:   string;   // a user id, or 'unassigned'
  academicYearId?: string;
  sortBy?:         StudentSortKey;
  sortDir?:        'asc' | 'desc';
}

export interface PageMeta {
  total: number; page: number; limit: number;
  totalPages: number; hasNextPage: boolean; hasPrevPage: boolean;
}

export function useCoordinatorStudents(params: StudentListParams = {}, opts?: { refetchInterval?: number }) {
  const { page = 1, limit = 20, ...rest } = params;
  return useQuery({
    queryKey: ['coordinator', 'students', { page, limit, ...rest }],
    refetchInterval: opts?.refetchInterval,
    queryFn:  async () => {
      const sp = new URLSearchParams({ page: String(page), limit: String(limit) });
      for (const [k, v] of Object.entries(rest)) {
        if (v != null && v !== '') sp.set(k, String(v));
      }
      const r = await api.get<{ data: { students: CoordinatorStudent[]; meta: PageMeta } }>(
        `/coordinator/students?${sp}`,
      );
      return r.data.data;
    },
  });
}

export function useCoordinatorProgrammes() {
  return useQuery({
    queryKey: ['coordinator', 'programmes'],
    queryFn:  async () => {
      const r = await api.get<{ data: { id: string; name: string }[] }>('/coordinator/programmes');
      return r.data.data;
    },
  });
}

export function useCoordinatorCohorts() {
  return useQuery({
    queryKey: ['coordinator', 'cohorts'],
    queryFn:  async () => {
      const r = await api.get<{ data: { id: string; label: string; isActive: boolean }[] }>('/coordinator/cohorts');
      return r.data.data;
    },
  });
}

export interface InternDetail {
  placement:   { id: string; status: string; startDate: string | null; endDate: string | null; company: string | null; cohort: string | null };
  student:     { id: string; name: string; email: string; department: string | null };
  supervisors: { academic: { id: string; name: string; email: string } | null; company: { id: string; name: string; email: string } | null };
  progress:    { submittedWeeks: number; totalWeeks: number; progressPct: number };
  avgQuality:  number | null;
  entries:     { id: string; weekNumber: number; status: string; periodStart: string; periodEnd: string; submittedAt: string | null; hoursLogged: number | null }[];
  riskHistory: { tier: 'low' | 'medium' | 'high'; score: number; computedAt: string }[];
  feedback:    { week: number; comment: string | null; status: string | null; by: string; createdAt: string }[];
  supervisorHistory: { at: string; by: string; kind: string }[];
}

export function useInternDetail(placementId?: string) {
  return useQuery({
    queryKey: ['coordinator', 'intern', placementId],
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: InternDetail }>(`/coordinator/students/${placementId}`);
      return r.data.data;
    },
  });
}

export function useMessageStudent() {
  return useMutation({
    mutationFn: ({ placementId, message }: { placementId: string; message: string }) =>
      api.post(`/coordinator/students/${placementId}/message`, { message }),
  });
}

export function useRemindStudent() {
  return useMutation({
    mutationFn: (placementId: string) => api.post(`/coordinator/students/${placementId}/reminder`),
  });
}

/** Invalidate coordinator lists/detail after a row action (e.g. reassign). */
export function useInvalidateCoordinator() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['coordinator'] });
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

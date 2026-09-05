import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Coordinator ───────────────────────────────────────────────

export interface CoordinatorDashboard {
  overview: {
    activePlacements:     number;
    totalStudents:        number;
    placedStudents:       number;
    applications:         number;
    shortlisted:          number;
    pendingApprovals:     number;
    complianceRate:       number;
    highRiskCount:        number;
    avgPerformance:       number | null;
    hostCompanies:        number;
    needsAttention:       number;   // interns flagged by the at-risk derivation (item 13)
    performanceThreshold: number;   // configured low-score threshold (0 = disabled)
  };
  riskDistribution: { low: number; medium: number; high: number };
  submissionTrends: { week: number; scheduled: number; submitted: number }[];
  recentApplications: {
    id: string;
    status: string;
    submittedAt: string;
    student: { firstName: string; lastName: string };
    opportunity: { title: string; company: { name: string; logoUrl: string | null } };
  }[];
  /** Ranked by real active-placement count, never hand-ordered. */
  partnerCompanies: {
    id: string; name: string; logoUrl: string | null; industry: string | null;
    isPartner: boolean; _count: { placements: number };
  }[];
  upcomingDeadlines: {
    id: string; title: string; closesAt: string | null; company: { name: string };
  }[];
  featureFlags:     { aiPulseMatching: boolean };
}

/** Dashboard metrics, optionally scoped to one cohort/academic year (item 17). */
export function useCoordinatorDashboard(academicYearId?: string) {
  return useQuery({
    queryKey: ['coordinator', 'dashboard', academicYearId ?? 'all'],
    queryFn:  async () => {
      const qs = academicYearId ? `?academicYearId=${academicYearId}` : '';
      const r = await api.get<{ data: CoordinatorDashboard }>(`/coordinator/dashboard${qs}`);
      return r.data.data;
    },
  });
}

export interface SupervisorWorkload {
  rows: { supervisor: { id: string; name: string }; internCount: number; overloaded: boolean }[];
  unassigned: number;
  summary: {
    supervisors: number; assignedTotal: number; unassigned: number;
    mean: number; max: number; min: number; spread: number; imbalanced: boolean;
  };
}

/** Interns-per-supervisor + imbalance flag (item 14), optionally cohort-scoped. */
export function useSupervisorWorkload(academicYearId?: string) {
  return useQuery({
    queryKey: ['coordinator', 'supervisor-workload', academicYearId ?? 'all'],
    queryFn:  async () => {
      const qs = academicYearId ? `?academicYearId=${academicYearId}` : '';
      const r = await api.get<{ data: SupervisorWorkload }>(`/coordinator/supervisor-workload${qs}`);
      return r.data.data;
    },
  });
}

export interface PerformanceDistribution {
  threshold:     number;
  scoredCount:   number;
  unscoredCount: number;
  buckets:        { label: string; count: number }[];
  belowThreshold: { placementId: string; name: string; avg: number }[];
}

/** Quality-score spread + below-threshold interns (item 15), optionally cohort-scoped. */
export function usePerformanceDistribution(academicYearId?: string, enabled = true) {
  return useQuery({
    queryKey: ['coordinator', 'performance-distribution', academicYearId ?? 'all'],
    enabled,
    queryFn:  async () => {
      const qs = academicYearId ? `?academicYearId=${academicYearId}` : '';
      const r = await api.get<{ data: PerformanceDistribution }>(`/coordinator/performance-distribution${qs}`);
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
  flagged:         boolean;
  flagReason:      string | null;
  attention:       boolean;   // derived at-risk flag (item 13)
  attentionReasons: { overdueLog: boolean; zeroProgress: boolean; noSupervisor: boolean; lowScore: boolean };
  programmeWeeks:  number;
  weeksDue:        number;
  submittedWeeks:  number;
  progressPct:     number | null;
}

export type StudentSortKey = 'name' | 'department' | 'supervisor' | 'progress' | 'score' | 'status';
export type StudentStatusFilter =
  | 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'not_started';

export interface StudentListParams {
  page?:           number;
  limit?:          number;
  riskTier?:       'low' | 'medium' | 'high';
  status?:         StudentStatusFilter;
  programmeId?:    string;
  supervisorId?:   string;   // a user id, or 'unassigned'
  academicYearId?: string;
  attention?:      boolean;  // true → only interns flagged as needing attention
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
  placement:   { id: string; status: string; startDate: string | null; endDate: string | null; company: string | null; cohort: string | null; flagged: boolean; flagReason: string | null };
  student:     { id: string; name: string; email: string; department: string | null };
  supervisors: { academic: { id: string; name: string; email: string } | null; company: { id: string; name: string; email: string } | null };
  // `weeksDue` is what has come due so far (the engagement denominator);
  // `programmeWeeks` is the cohort's configured length. progressPct is null
  // before the first week is due — nothing is owed, so there is no percentage.
  progress:    { submittedWeeks: number; weeksDue: number; programmeWeeks: number; progressPct: number | null };
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

export function useSetFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ placementId, flagged, reason }: { placementId: string; flagged: boolean; reason?: string }) =>
      api.post(`/coordinator/students/${placementId}/flag`, { flagged, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordinator'] }),
  });
}

export function useBulkRemind() {
  return useMutation({
    mutationFn: (placementIds: string[]) => api.post('/coordinator/students/bulk/reminder', { placementIds }),
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ placementIds, supervisorId }: { placementIds: string[]; supervisorId: string }) =>
      api.post('/coordinator/students/bulk/assign', { placementIds, supervisorId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordinator'] }),
  });
}

/** Fetch the interns CSV (auth header is added by the api client) and download it.
 *  `ids` limits to selected placements; `academicYearId` scopes to one cohort. */
export async function downloadInternsCsv(ids?: string[], academicYearId?: string) {
  const params: Record<string, string> = {};
  if (ids && ids.length) params.ids = ids.join(',');
  if (academicYearId) params.academicYearId = academicYearId;
  const r = await api.get('/coordinator/students/export.csv', {
    responseType: 'blob',
    params,
  });
  const url = URL.createObjectURL(r.data as Blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'interns.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export interface CoordinatorActivity {
  id:         string;
  action:     string;
  entityType: string;
  entityId:   string | null;
  actor:      string;
  actorRole:  string;
  summary:    string;
  createdAt:  string;
}

// ── Global search (item 18) ───────────────────────────────────

export interface CoordinatorSearchResults {
  interns:   { placementId: string; name: string; subtitle: string }[];
  companies: { id: string; name: string; subtitle: string }[];
}

/** Debounced typeahead across interns + companies. Disabled until 2+ chars. */
export function useCoordinatorSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: ['coordinator', 'search', query],
    enabled:  query.length >= 2,
    queryFn:  async () => {
      const r = await api.get<{ data: CoordinatorSearchResults }>(`/coordinator/search?q=${encodeURIComponent(query)}`);
      return r.data.data;
    },
  });
}

// ── Feature flags (item 24) ───────────────────────────────────

export interface CoordinatorFeatureFlags {
  aiPulseMatching: boolean;
  aiInsights:      boolean;
}

export function useCoordinatorFeatureFlags() {
  return useQuery({
    queryKey: ['coordinator', 'feature-flags'],
    staleTime: 5 * 60_000,
    queryFn:  async () => {
      const r = await api.get<{ data: CoordinatorFeatureFlags }>('/coordinator/feature-flags');
      return r.data.data;
    },
  });
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
    assignedStudents:     number;
    pendingReview:        number;
    avgQualityScore:      number | null;
    reportsThisMonth:     number;
    completedInternships: number;
    pendingApprovals:     number;
    avgProgress:          number | null;
  };
  upcomingReviews: {
    id:              string;
    scheduledAt:     string;
    visitType:       string;
    durationMinutes: number;
    location:        string | null;
    placementId:     string;
    student:         string;
    company:         string | null;
  }[];
  students: {
    placementId:     string;
    student:         { id: string; firstName: string; lastName: string; email: string };
    riskTier:        'low' | 'medium' | 'high' | null;
    riskScore:       number | null;
    riskFactors:     string[];
    recentWeeks:     { week: number; status: string; score: number | null }[];
    avgQualityScore: number | null;
    lastSubmittedAt: string | null;
    nextReviewAt:    string | null;
    company:         string | null;
    finalizationStatus: 'active' | 'assessment_pending' | 'finalized';
    submittedWeeks:  number;
    weeksDue:        number;
    programmeWeeks:  number;
    progressPct:     number | null;
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
    avgEngagement:  number | null;
  };
  pulseBoard: {
    placementId:   string;
    name:          string;
    department:    string | null;
    riskTier:      'low' | 'medium' | 'high' | null;
    submittedWeeks: number;
    weeksDue:      number;
    programmeWeeks: number;
    engagementPct: number | null;
    feedbackCount: number;
  }[];
  riskAlerts: {
    placementId: string;
    name:        string;
    factors:     string[];
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

// ── AI enrichment pipeline (admin) ────────────────────────────
export interface EnrichmentHealth {
  pending: number; processing: number; succeeded: number;
  failed: number; abandoned: number; total: number; revivable: number;
}

export function useEnrichmentHealth() {
  return useQuery({
    queryKey: ['admin', 'ai', 'enrichment'],
    refetchInterval: 20_000, // live-ish: the worker drains the queue continuously
    queryFn: async () => {
      const r = await api.get<{ data: EnrichmentHealth }>('/admin/ai/enrichment');
      return r.data.data;
    },
  });
}

export function useReviveEnrichment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await api.post<{ data: { revived: number } }>('/admin/ai/enrichment/revive');
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'ai', 'enrichment'] }),
  });
}

// ── AI Insights & Analytics ───────────────────────────────────

export interface InsightsData {
  overview: { activeInterns: number; flaggedCount: number };
  performanceMonitoring: {
    placementId:     string;
    name:            string;
    department:      string;
    engagementPct:   number | null;
    engagementLabel: string;
    submittedCount:  number;
    weeksDue:        number;
    programmeWeeks:  number;
    relevanceScore:  number | null;  // advisory AI relevance 0–100, or null
    status:          string;
    flagged:         boolean;
  }[];
  relevanceTrend: { week: number; avgRelevance: number }[];
  hours: { hasData: boolean; weeks: { week: number; totalHours: number; avgHours: number }[] };
  skillProfile: { hasData: boolean; competencies: { tag: string; count: number; pct: number }[] };
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

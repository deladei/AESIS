import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// The four weighted components of the final grade. Mirrors modules/grades.
export const GRADE_COMPONENTS = ['industry', 'university', 'report', 'logbook'] as const;
export type GradeComponent = (typeof GRADE_COMPONENTS)[number];

export type GradeStatus = 'draft' | 'approved' | 'released';

export interface GradeComponentCell {
  raw:      number | null;
  weighted: number | null;
}

// The serializer (grades.policy.serializeGrade) returns a role-filtered subset.
// This is the union of all three shapes; fields a given role can't see are
// simply absent. The component reads only what its role is allowed.
export interface GradeView {
  status:   GradeStatus;
  released: boolean;
  // coordinator/admin: all four; supervisor: university/report/logbook only.
  components?: Partial<Record<GradeComponent, GradeComponentCell>>;
  // coordinator/admin only.
  total?:               number | null;
  coordinatorOverride?: number | null;
  overrideReason?:      string | null;
  effectiveTotal?:      number | null;
  signedOffAt?:         string | null;
  releasedAt?:          string | null;
}

const gradeKey = (placementId: string) => ['grade', placementId] as const;

export function useGrade(placementId: string | undefined) {
  return useQuery({
    queryKey: gradeKey(placementId ?? 'none'),
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: GradeView }>(`/grades/${placementId}`);
      return r.data.data;
    },
  });
}

// All mutations write the returned (role-filtered) view straight into the cache.
function useGradeMutation<TArgs>(
  placementId: string,
  fn: (args: TArgs) => Promise<GradeView>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess:  (view) => qc.setQueryData(gradeKey(placementId), view),
  });
}

export function useScoreComponent(placementId: string) {
  return useGradeMutation(placementId, async (input: { component: GradeComponent; raw: number }) => {
    const r = await api.post<{ data: GradeView }>(`/grades/${placementId}/component`, input);
    return r.data.data;
  });
}

export function useAggregateGrade(placementId: string) {
  return useGradeMutation<void>(placementId, async () => {
    const r = await api.post<{ data: GradeView }>(`/grades/${placementId}/aggregate`);
    return r.data.data;
  });
}

export function useOverrideGrade(placementId: string) {
  return useGradeMutation(placementId, async (input: { total: number; reason: string }) => {
    const r = await api.patch<{ data: GradeView }>(`/grades/${placementId}/override`, input);
    return r.data.data;
  });
}

export function useReleaseGrade(placementId: string) {
  return useGradeMutation<void>(placementId, async () => {
    const r = await api.post<{ data: GradeView }>(`/grades/${placementId}/release`);
    return r.data.data;
  });
}

// ── Audit trail (coordinator/admin) ───────────────────────────

export interface GradeAuditEntry {
  id:       string;
  action:   string;
  actor:    { name: string; role: string } | null;
  metadata: Record<string, unknown> | null;
  at:       string;
}

/** Coordinator/admin — the immutable audit trail for one placement's grade. */
export function useGradeAudit(placementId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['grade-audit', placementId ?? 'none'],
    enabled:  !!placementId && enabled,
    queryFn:  async () => {
      const r = await api.get<{ data: GradeAuditEntry[] }>(`/grades/${placementId}/audit`);
      return r.data.data;
    },
  });
}

// ── Cohort bulk-release (coordinator/admin) ───────────────────

/**
 * Release every approved grade in an academic year at once. Draft grades are
 * skipped server-side; released grades are untouched. Invalidates per-placement
 * grade caches so any open panel reflects the new released state.
 */
export function useReleaseCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (academicYearId: string) => {
      const r = await api.post<{ data: { academicYearId: string; released: number } }>(
        `/grades/cohort/${academicYearId}/release`,
      );
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grade'] }),
  });
}

// ── Cohort released-grade report / export (coordinator/admin) ──

export interface CohortReportRow {
  studentName:    string;
  indexNumber:    string | null;
  company:        string | null;
  region:         string | null;
  supervisor:     string | null;
  industry:       number | null;
  university:     number | null;
  report:         number | null;
  logbook:        number | null;
  total:          number | null;
  effectiveTotal: number | null;
  releasedAt:     string | null;
}

export interface CohortReport {
  academicYearId: string;
  academicYear:   string;
  count:          number;
  rows:           CohortReportRow[];
}

/**
 * Fetch every released grade in an academic year, flat, for export. On-demand
 * (a mutation, not a standing query) so it runs only when the coordinator
 * clicks Export — the caller turns the rows into a CSV download.
 */
export function useCohortReport() {
  return useMutation({
    mutationFn: async (academicYearId: string) => {
      const r = await api.get<{ data: CohortReport }>(`/grades/cohort/${academicYearId}/report`);
      return r.data.data;
    },
  });
}

// ── Batch B — company-supervisor industry-score magic link ────

export interface IndustryInvite {
  token:     string;
  url:       string;
  expiresAt: string;
}

/** Coordinator issues the single-use magic link for the company supervisor. */
export function useInviteIndustry(placementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await api.post<{ data: IndustryInvite }>(`/grades/${placementId}/industry-invite`);
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: gradeKey(placementId) }),
  });
}

export interface IndustryInviteContext {
  organisation: string | null;
  student:      string;
  startDate:    string | null;
  endDate:      string | null;
}

/** Public — fetch the industry-score form context for a magic-link token. */
export function useIndustryContext(token: string | undefined) {
  return useQuery({
    queryKey: ['grade-invite', token],
    enabled:  !!token,
    retry:    false,
    queryFn:  async () => {
      const r = await api.get<{ data: IndustryInviteContext }>(`/grade-invite/${token}`);
      return r.data.data;
    },
  });
}

/** Public — submit the industry score (single-use). */
export function useSubmitIndustryScore(token: string) {
  return useMutation({
    mutationFn: async (raw: number) => {
      const r = await api.post<{ data: { submitted: boolean } }>(`/grade-invite/${token}`, { raw });
      return r.data.data;
    },
  });
}

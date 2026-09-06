import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RegionValue } from '@/lib/regions';

export interface PlacementSupervisor {
  id:        string;
  firstName: string;
  lastName:  string;
}

export type FinalizationStatus = 'active' | 'assessment_pending' | 'finalized';

export interface Placement {
  id:                   string;
  placementStatus:      string;
  finalizationStatus?:  FinalizationStatus;
  studentId:            string;
  student?:             {
    id?: string; firstName: string; lastName: string; email: string;
    indexNumber?: string | null;
  };
  company?:             { name: string; industry?: string | null };
  academicSupervisor?:  PlacementSupervisor | null;
  startDate:            string | null;
  endDate:              string | null;
  createdAt:            string;
  /** The placement the student is actually on. A student accumulates rows —
   *  a superseded transfer, an administratively closed one, a stray pending
   *  from registration — and only one of them is current. */
  isCurrent?:           boolean;
  /** Coordinator board columns, resolved server-side (see listPlacements). */
  role?:                string | null;
  department?:          string | null;
  reviewedBy?:          string | null;
  /** A cancellation carrying a reason — i.e. the coordinator refused it. */
  isRejected?:          boolean;
  approvedAt?:          string | null;
  rejectionReason?:     string | null;
  updatedAt?:           string;
  region?:              RegionValue | null;
}

export interface PlacementStats {
  pending:  number;
  approved: number;
  rejected: number;
  total:    number;
  /** Share of DECIDED placements approved; null while nothing is decided. */
  placementRate: number | null;
  pipeline: { key: string; label: string; count: number }[];
}

/** Placement board headline figures + funnel (coordinator/admin). */
export function usePlacementStats() {
  return useQuery({
    queryKey: ['placements', 'stats'],
    queryFn:  async () => {
      const r = await api.get<{ data: PlacementStats }>('/placements/stats');
      return r.data.data;
    },
  });
}

export interface Supervisor {
  id:        string;
  firstName: string;
  lastName:  string;
  email:     string;
  region?:   string | null;
  load?:     number;
}

export interface UnassignedPlacement {
  id:        string;
  region:    string | null;
  createdAt: string;
  student:   { id: string; name: string; email: string };
  company:   string | null;
}

export function useMyPlacements() {
  return useQuery({
    queryKey: ['placements', 'mine'],
    queryFn:  async () => {
      const r = await api.get<{ data: Placement[] | { placements?: Placement[] } }>('/placements/mine');
      // Normalize to an array regardless of payload shape: the endpoint returns
      // a bare array, but tolerate a paginated `{ placements }` envelope or any
      // unexpected/cold-start body so callers can always `.find`/`.map` safely.
      const d = r.data?.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        return (d as { placements: Placement[] }).placements;
      }
      return [] as Placement[];
    },
  });
}

/**
 * THE placement — the one every student screen should be talking about.
 *
 * The rule was copy-pasted into four pages as
 * `placements.find(p => p.placementStatus === 'active') ?? placements[0]`,
 * which ignores `isCurrent` entirely. That is wrong twice over: a student whose
 * old placement was completed and who has a stray pending row reads
 * "Awaiting approval" though they were approved months ago, and a student
 * carrying a superseded `active` row can be looking at a different placement
 * from the one their supervisor is updating.
 *
 * `isCurrent` wins, then an active one, then the most recent. The API already
 * returns them in that order; this re-applies it so the rule survives a caller
 * that sorts or filters the list first.
 */
export function useMyPlacement() {
  const query = useMyPlacements();
  const placements = query.data;
  const placement =
    placements?.find((p) => p.isCurrent) ??
    placements?.find((p) => p.placementStatus === 'active') ??
    placements?.[0];
  return { ...query, placement, placements };
}

/** Placements assigned to the logged-in academic supervisor. */
export function useAssignedPlacements() {
  return useQuery({
    queryKey: ['placements', 'assigned'],
    queryFn:  async () => {
      const r = await api.get<{ data: Placement[] | { placements?: Placement[] } }>('/placements/assigned');
      const d = r.data?.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        return (d as { placements: Placement[] }).placements;
      }
      return [] as Placement[];
    },
  });
}

export function useAllPlacements(page = 1, status?: string, q?: string) {
  return useQuery({
    queryKey: ['placements', 'all', { page, status, q }],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (q && q.trim()) params.set('q', q.trim());
      const r = await api.get<{
        data: Placement[] | { placements?: Placement[]; meta?: unknown };
        meta?: unknown;
      }>(`/placements?${params}`);
      // The endpoint returns a bare `data` array with `meta` as a sibling. Normalize
      // to `{ placements, meta }` so callers can `?.placements` safely; also tolerate
      // a nested `{ placements, meta }` envelope or any cold-start/error body.
      const d = r.data?.data;
      if (Array.isArray(d)) {
        return { placements: d, meta: r.data?.meta };
      }
      if (d && Array.isArray((d as { placements?: Placement[] }).placements)) {
        const env = d as { placements: Placement[]; meta?: unknown };
        return { placements: env.placements, meta: env.meta };
      }
      return { placements: [] as Placement[], meta: undefined };
    },
  });
}

export interface Company {
  id:          string;
  name:        string;
  industry:    string | null;
  website:     string | null;
  description: string | null;
  logoUrl:     string | null;
  isPartner:   boolean;
  /** Where most of this company's placements sit. Null when none carry one. */
  region:      RegionValue | null;
  /** Distinct students ever placed here. */
  internCount:       number;
  activePlacements:  number;
  openOpportunities: number;
  /** Derived: hosting somebody today, or on the books with nobody placed. */
  status:      'active' | 'pending';
  _count?:     { placements: number };
}

/** Host companies list (coordinator/admin). Backed by GET /api/v1/companies. */
export function useCompanies(page = 1) {
  return useQuery({
    queryKey: ['companies', { page }],
    queryFn:  async () => {
      const r = await api.get<{ data: Company[]; meta?: unknown }>(`/companies?page=${page}&limit=50`);
      return { companies: r.data?.data ?? [], meta: r.data?.meta };
    },
  });
}

export interface CompaniesOverview {
  totalCompanies:    number;
  activePlacements:  number;
  openOpportunities: number;
  placedInterns:     number;
  topCompanies: {
    id: string; name: string; industry: string | null;
    logoUrl: string | null; placements: number;
  }[];
}

/** Cohort-wide company figures + the partner leaderboard (by placement count). */
export function useCompaniesOverview() {
  return useQuery({
    queryKey: ['companies', 'overview'],
    queryFn:  async () => {
      const r = await api.get<{ data: CompaniesOverview }>('/companies/overview');
      return r.data.data;
    },
  });
}

export interface CreateCompanyInput {
  name:     string;
  industry?: string;
  website?:  string;
  address?:  string;
}

/** Register a host company (coordinator/admin). */
export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCompanyInput) => {
      const r = await api.post<{ data: Company }>('/companies', input);
      return r.data.data;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['companies'] }); },
  });
}

export interface CompanyInternRow {
  id: string;
  placementStatus: string;
  startDate: string | null;
  endDate: string | null;
  student: { id: string; firstName: string; lastName: string; email: string; indexNumber: string | null };
  academicSupervisor: { id: string; firstName: string; lastName: string } | null;
}

/** One company + every intern placed there (coordinator/admin). */
export function useCompanyInterns(companyId: string | undefined) {
  return useQuery({
    queryKey: ['companies', companyId, 'interns'],
    enabled:  !!companyId,
    queryFn:  async () => {
      const r = await api.get<{ data: { company: Company; placements: CompanyInternRow[] } }>(
        `/companies/${companyId}/interns`,
      );
      return r.data.data;
    },
  });
}

/** Academic supervisors available for assignment (coordinator/admin only). */
export function useSupervisors() {
  return useQuery({
    queryKey: ['coordinator', 'supervisors'],
    queryFn:  async () => {
      const r = await api.get<{ data: Supervisor[] }>('/coordinator/supervisors');
      return r.data.data;
    },
  });
}

/** Placements whose region had no supervisor at registration (coordinator queue). */
export function useUnassignedPlacements() {
  return useQuery({
    queryKey: ['coordinator', 'unassigned-placements'],
    queryFn:  async () => {
      const r = await api.get<{ data: UnassignedPlacement[] }>('/coordinator/unassigned-placements');
      return r.data.data ?? [];
    },
  });
}

export interface BulkSupervisorRow {
  firstName: string;
  lastName: string;
  email: string;
  region: string;
}
export interface BulkSupervisorResult {
  email: string;
  status: 'created' | 'updated' | 'skipped';
  region?: string;
  message?: string;
}
export interface BulkSupervisorResponse {
  total: number; created: number; updated: number; skipped: number;
  results: BulkSupervisorResult[];
}

/** Upload a supervisor roster (name/email/region). Coordinator/admin only. */
export function useBulkCreateSupervisors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supervisors: BulkSupervisorRow[]) => {
      const r = await api.post<{ data: BulkSupervisorResponse }>('/coordinator/supervisors/bulk', { supervisors });
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordinator'] }),
  });
}

// ── Student class roster (pre-registration list) ────────────────

export interface RosterUploadRow {
  firstName: string;
  lastName: string;
  email: string;
  indexNumber?: string | null;
}

export interface RosterUploadResponse {
  total: number;
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  results: { email: string; status: 'created' | 'updated' | 'linked' | 'skipped'; message?: string }[];
}

export interface RosterListRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  indexNumber: string | null;
  registered: boolean;
  claimedAt: string | null;
  account: { id: string; name: string; email: string } | null;
}

/** Uploaded class roster with per-student registration status. */
export function useStudentRoster() {
  return useQuery({
    queryKey: ['coordinator', 'roster'],
    queryFn:  async () => {
      const r = await api.get<{ data: { total: number; registered: number; rows: RosterListRow[] } }>(
        '/coordinator/students/roster',
      );
      return r.data.data;
    },
  });
}

export function useUploadStudentRoster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (students: RosterUploadRow[]) => {
      const r = await api.post<{ data: RosterUploadResponse }>('/coordinator/students/roster/bulk', { students });
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordinator', 'roster'] }),
  });
}

/** Set (or clear, with null) the single region an academic supervisor covers. */
export function useSetSupervisorRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, region }: { id: string; region: string | null }) =>
      api.patch(`/coordinator/supervisors/${id}/region`, { region }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinator'] });
    },
  });
}

export function useUpdatePlacementStatus() {
  const qc = useQueryClient();
  return useMutation({
    // Backend expects `status` (+ optional supervisorId on approval, rejectionReason on reject)
    mutationFn: ({ id, status, supervisorId, rejectionReason }: {
      id: string; status: string; supervisorId?: string; rejectionReason?: string;
    }) => api.patch(`/placements/${id}/status`, { status, supervisorId, rejectionReason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
    },
  });
}

/** Assign or reassign the academic supervisor on any placement. */
export function useAssignSupervisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, supervisorId }: { id: string; supervisorId: string }) =>
      api.patch(`/placements/${id}/supervisor`, { supervisorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['coordinator'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
    },
  });
}

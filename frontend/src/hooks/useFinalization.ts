import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types (mirror modules/finalization) ──
export interface PlacementAssessment {
  id:                 string;
  placementId:        string;
  grade:              string;
  narrative:          string | null;
  academicSupervisorId: string | null;
  finalizedAt:        string | null;
  waivers?:           unknown;
  crossWeekSummary?:  unknown;
  createdAt:          string;
  updatedAt:          string;
}

export interface AttestationInvite {
  token:     string;
  url:       string;
  expiresAt: string;
}

export interface AttestationContext {
  organisation: string | null;
  student:      string;
  startDate:    string | null;
  endDate:      string | null;
}

export interface WeekWaiver {
  weekNumber: number;
  reason:     string;
}

// ── Authenticated: academic supervisor / admin ──

export interface EvaluationCriterion {
  criterion: string;
  rating:    number; // 1–5
  comment?:  string;
}
export interface EvaluationForm {
  criteria:        EvaluationCriterion[];
  recommendation?: 'pass' | 'distinction' | 'resit' | 'fail';
}

/** Record (or update) the binding placement assessment. active → assessment_pending. */
export function useRecordAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placementId, grade, narrative, evaluation }: {
      placementId: string; grade: string; narrative?: string; evaluation?: EvaluationForm;
    }) => {
      const r = await api.post<{ data: PlacementAssessment }>(
        `/placements/${placementId}/assessment`,
        { grade, narrative, evaluation },
      );
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['final-assessment'] });
    },
  });
}

export interface FinalAssessment {
  finalizationStatus: 'active' | 'assessment_pending' | 'finalized';
  finalized:          boolean;
  student:            string;
  organisation:       string | null;
  startDate:          string | null;
  endDate:            string | null;
  grade:              string | null;
  narrative:          string | null;
  evaluation:         EvaluationForm | null;
  signedOffBy:        string | null;
  signedOffAt:        string | null;
  crossWeekSummary:   unknown | null;
  finalReport:        { fileName: string; fileUrl: string; uploadedAt: string } | null;
  companyAttestation: { confirmed: boolean; comment: string | null; attestedAt: string | null } | null;
}

/**
 * The closeout package. The backend gates visibility — students/company
 * supervisors get a 403 until the placement is finalized. `retry:false` so a
 * 403/404 is treated as definitive (not retried).
 */
export function useFinalAssessment(placementId?: string) {
  return useQuery({
    queryKey: ['final-assessment', placementId],
    enabled:  !!placementId,
    retry:    false,
    queryFn: async () => {
      const r = await api.get<{ data: FinalAssessment }>(`/placements/${placementId}/final-assessment`);
      return r.data.data;
    },
  });
}

/** Finalize a placement. Any week not acknowledged must be waived with a reason. */
export function useFinalizePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placementId, waivers }: {
      placementId: string; waivers: WeekWaiver[];
    }) => {
      const r = await api.post<{ data: PlacementAssessment }>(
        `/placements/${placementId}/finalize`,
        { waivers },
      );
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['placements'] });
      qc.invalidateQueries({ queryKey: ['entries'] });
    },
  });
}

/** Generate a single-use magic link for the company supervisor's attestation. */
export function useInviteAttestation() {
  return useMutation({
    mutationFn: async (placementId: string) => {
      const r = await api.post<{ data: AttestationInvite }>(
        `/placements/${placementId}/attestation/invite`,
      );
      return r.data.data;
    },
  });
}

// ── Public (magic link, no account) ──

/** Fetch the attestation form context. Public — the token IS the authorization. */
export function useAttestationContext(token: string | undefined) {
  return useQuery({
    queryKey: ['attestation', token],
    enabled:  !!token,
    retry:    false, // a 404/410 is a definitive answer, not a transient failure
    queryFn:  async () => {
      const r = await api.get<{ data: AttestationContext }>(`/attest/${token}`);
      return r.data.data;
    },
  });
}

/** Submit the company supervisor's attestation. Single-use. */
export function useSubmitAttestation(token: string | undefined) {
  return useMutation({
    mutationFn: async ({ confirmed, comment }: { confirmed: boolean; comment?: string }) => {
      const r = await api.post<{ data: { confirmed: boolean; attestedAt: string } }>(
        `/attest/${token}`,
        { confirmed, comment },
      );
      return r.data.data;
    },
  });
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Issue side — staff/supervisor mints & sends the weekly-comment link ──

export interface IndustrySupervisor {
  id:                 string;
  name:               string;
  email:              string | null;
  designation:        string | null;
  departmentUnit:     string | null;
  verificationStatus: string;
}

/** List a placement's industry-supervisor records (the token recipients). */
export function useIndustrySupervisors(placementId: string | undefined) {
  return useQuery({
    queryKey: ['industry-supervisors', placementId],
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: IndustrySupervisor[] }>(
        `/placements/${placementId}/industry-supervisors`,
      );
      return r.data.data;
    },
  });
}

export interface WeeklyLinkResult {
  token:     string;
  url:       string;
  tokenId:   string;
  expiresAt: string;
  emailedTo: string | null;
}

/**
 * Coordinator/supervisor issues the week-scoped weekly-comment link for an
 * industry supervisor. `send:true` emails it (422 if no email on record);
 * otherwise the returned `url` is copied manually.
 */
export function useIssueWeeklyLink() {
  return useMutation({
    mutationFn: async (vars: { supervisorId: string; weekNumber: number; send: boolean }) => {
      const r = await api.post<{ data: WeeklyLinkResult }>(
        `/industry-supervisors/${vars.supervisorId}/tokens`,
        { purpose: 'weekly_comment', weekNumber: vars.weekNumber, send: vars.send },
      );
      return r.data.data;
    },
  });
}

// Public magic-link weekly comment (industry supervisor → student's logbook).
// FORMATIVE: unlike the confidential assessment, the student reads this.

export interface WeeklyCommentContext {
  supervisorName: string;
  studentName:    string;
  companyName:    string | null;
  weekNumber:     number;
  expiresAt:      string;
}

/** Public — fetch the weekly-comment form context for a magic-link token. */
export function useWeeklyCommentContext(token: string | undefined) {
  return useQuery({
    queryKey: ['weekly-comment-form', token],
    enabled:  !!token,
    retry:    false,
    queryFn:  async () => {
      const r = await api.get<{ data: WeeklyCommentContext }>(`/industry-form/weekly/${token}`);
      return r.data.data;
    },
  });
}

/** Public — submit the weekly comment (single-use link). */
export function useSubmitWeeklyComment(token: string) {
  return useMutation({
    mutationFn: async (comment: string) => {
      const r = await api.post<{ data: { weekNumber: number } }>(
        `/industry-form/weekly/${token}`,
        { comment },
      );
      return r.data.data;
    },
  });
}

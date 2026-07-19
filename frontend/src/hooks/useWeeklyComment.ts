import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

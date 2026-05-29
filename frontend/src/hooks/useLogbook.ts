import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface LogbookSubmission {
  id:               string;
  weekNumber:       number;
  submissionStatus: string;
  aiAnalysisStatus: string;
  submittedAt:      string | null;
  deadline:         string;
  isLate:           boolean;
  tasksCompleted:        string | null;
  technicalChallenges:   string | null;
  reflection:            string | null;
  technologiesUsed:      string[];
  student?: { id: string; firstName: string; lastName: string; email: string };
  placement?: { company?: { name: string } };
  analysis?: {
    qualityScore:           number | null;
    relevanceScore:         number | null;
    plagiarismSimilarity:   number | null;
    isPlagiarismFlagged:    boolean;
    isRelevanceFlagged:     boolean;
    aiFeedbackSummary:      string | null;
    rubric?: { label: string; score: number; max: number }[];
    shapFactors?: { factor: string; contribution: number }[];
  } | null;
}

export function useSubmissions(placementId: string | undefined) {
  return useQuery({
    queryKey: ['logbook', 'submissions', placementId],
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookSubmission[] }>(
        `/logbook/placements/${placementId}/submissions`,
      );
      return r.data.data;
    },
  });
}

export function useSubmission(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['logbook', 'submission', submissionId],
    enabled:  !!submissionId,
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookSubmission }>(`/logbook/submissions/${submissionId}`);
      return r.data.data;
    },
  });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, data }: {
      submissionId: string;
      data: { tasksCompleted?: string; technicalChallenges?: string; reflection?: string; technologiesUsed?: string[] };
    }) => api.patch(`/logbook/submissions/${submissionId}/draft`, data),
    onSuccess: (_r, { submissionId }) => {
      qc.invalidateQueries({ queryKey: ['logbook', 'submission', submissionId] });
    },
  });
}

export function useSubmitLogbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submissionId: string) =>
      api.post(`/logbook/submissions/${submissionId}/submit`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logbook'] });
    },
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, feedbackText, rating, outcome }: {
      submissionId: string; feedbackText: string; rating?: number; outcome: 'approved' | 'flagged';
    }) => api.post(`/logbook/submissions/${submissionId}/feedback`, { feedbackText, rating, outcome }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logbook'] });
      qc.invalidateQueries({ queryKey: ['supervisor'] });
    },
  });
}

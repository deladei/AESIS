import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ApplicationStatus =
  | 'pending' | 'under_review' | 'shortlisted' | 'offered' | 'accepted' | 'rejected' | 'withdrawn';

export interface Opportunity {
  id:               string;
  title:            string;
  description:      string;
  requiredSkills:   string[];
  location:         string | null;
  slots:            number;
  minAcademicLevel: number | null;
  closesAt:         string | null;
  status:           'draft' | 'published' | 'closed' | 'filled';
  company:          { id: string; name: string; logoUrl: string | null; industry: string | null };
  _count:           { applications: number };
  /** The caller's own application status, so the list needs no second fetch. */
  myApplication:    ApplicationStatus | null;
}

export interface Application {
  id:              string;
  status:          ApplicationStatus;
  statement:       string | null;
  submittedAt:     string;
  statusChangedAt: string;
  decisionNote:    string | null;
  student:     { id: string; firstName: string; lastName: string; email: string; academicLevel: number | null };
  opportunity: { id: string; title: string; company: { name: string; logoUrl: string | null } };
}

export function useOpportunities() {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: async () => (await api.get<{ data: Opportunity[] }>('/opportunities')).data.data,
  });
}

export function useApplications(status?: ApplicationStatus, limit = 20) {
  return useQuery({
    queryKey: ['applications', status ?? 'all', limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set('status', status);
      const r = await api.get<{ data: Application[] }>(`/applications?${params}`);
      return r.data.data;
    },
  });
}

export function useApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, statement }: { opportunityId: string; statement?: string }) =>
      (await api.post(`/opportunities/${opportunityId}/applications`, { statement })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useDecideApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: ApplicationStatus; note?: string }) =>
      (await api.patch(`/applications/${id}/status`, { status, note })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] });
      qc.invalidateQueries({ queryKey: ['coordinator', 'dashboard'] });
    },
  });
}

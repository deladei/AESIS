import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ApprovalKind = 'leave' | 'extension' | 'supervisor_change' | 'training_plan' | 'company_transfer';

export interface PendingApproval {
  id:            string;
  /** 'approval' is decided here; 'transfer' links out to the placements screen. */
  source:        'approval' | 'transfer';
  kind:          ApprovalKind;
  title:         string;
  student:       string;
  company:       string | null;
  requestedAt:   string;
  effectiveFrom: string | null;
  effectiveTo:   string | null;
}

const KEY = ['approvals', 'pending'] as const;

export function usePendingApprovals() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<{ data: PendingApproval[] }>('/approvals/pending')).data.data,
  });
}

export function useCreateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      placementId: string; kind: Exclude<ApprovalKind, 'company_transfer'>;
      title: string; reason: string; effectiveFrom?: string; effectiveTo?: string;
    }) => (await api.post('/approvals', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      (await api.patch(`/approvals/${id}/decide`, { decision, note })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['supervisor', 'dashboard'] });
    },
  });
}

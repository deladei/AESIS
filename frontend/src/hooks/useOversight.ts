import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface OversightFlags {
  overdueLogs:          number;
  lowAvgScore:          boolean;
  noSupervisorFeedback: boolean;
}

export interface OversightRow {
  placementId:     string;
  student:         { id: string; firstName: string; lastName: string; email: string };
  department:      string | null;
  supervisor:      { id: string; name: string } | null;
  riskTier:        'low' | 'medium' | 'high' | null;
  avgQualityScore: number | null;
  lastActivityAt:  string | null;
  flags:           OversightFlags;
  atRisk:          boolean;
}

export interface Oversight {
  rows:    OversightRow[];
  summary: { total: number; atRisk: number };
}

/** Cross-cohort at-risk monitoring (coordinator/admin). Read-only. */
export function useOversight(enabled = true) {
  return useQuery({
    queryKey: ['coordinator', 'oversight'],
    enabled,
    queryFn: async () => {
      const r = await api.get<{ data: Oversight }>('/coordinator/oversight');
      return r.data.data;
    },
  });
}

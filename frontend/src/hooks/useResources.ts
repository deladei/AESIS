import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ResourceCategory =
  | 'guideline' | 'template' | 'rubric' | 'policy' | 'form' | 'sample' | 'other';

export interface Resource {
  id:          string;
  title:       string;
  description: string | null;
  category:    ResourceCategory;
  fileUrl:     string | null;
  externalUrl: string | null;
  sortOrder:   number;
  createdAt:   string;
}

/** The shelf, already filtered server-side to this role's audience. */
export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: async () => (await api.get<{ data: Resource[] }>('/resources')).data.data,
  });
}

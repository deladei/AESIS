import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ObjectiveProgress {
  id:                  string;
  title:               string;
  description:         string | null;
  createdAt:           string;
  confirmedEntryCount: number;
  suggestedEntryCount: number;
}

export interface EntryObjectiveLink {
  objectiveId: string;
  status:      'suggested' | 'confirmed';
  source:      'human' | 'ai';
  confirmedAt: string | null;
  objective:   { id: string; title: string };
}

// ── Per-placement objectives ──

/** Objectives + progress for a placement. Only confirmed links count. */
export function useObjectives(placementId?: string) {
  return useQuery({
    queryKey: ['objectives', placementId],
    enabled:  !!placementId,
    queryFn: async () => {
      const r = await api.get<{ data: ObjectiveProgress[] }>(`/placements/${placementId}/objectives`);
      return r.data.data;
    },
  });
}

/** Define a new objective (academic supervisor / admin). */
export function useDefineObjective(placementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string }) => {
      const r = await api.post(`/placements/${placementId}/objectives`, input);
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objectives', placementId] }),
  });
}

// ── Per-entry links ──

export function useEntryObjectives(entryId?: string) {
  return useQuery({
    queryKey: ['entry-objectives', entryId],
    enabled:  !!entryId,
    queryFn: async () => {
      const r = await api.get<{ data: EntryObjectiveLink[] }>(`/entries/${entryId}/objectives`);
      return r.data.data;
    },
  });
}

function useEntryLinkMutation<TArgs>(
  entryId: string,
  placementId: string | undefined,
  fn: (args: TArgs) => Promise<unknown>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entry-objectives', entryId] });
      if (placementId) qc.invalidateQueries({ queryKey: ['objectives', placementId] });
      qc.invalidateQueries({ queryKey: ['student', 'dashboard'] });
    },
  });
}

/** Student maps their entry to objectives (human, confirmed). */
export function useAddEntryObjectives(entryId: string, placementId?: string) {
  return useEntryLinkMutation(entryId, placementId, (objectiveIds: string[]) =>
    api.post(`/entries/${entryId}/objectives`, { objectiveIds }),
  );
}

/** Confirm an AI-suggested link so it starts counting. */
export function useConfirmEntryObjective(entryId: string, placementId?: string) {
  return useEntryLinkMutation(entryId, placementId, (objectiveId: string) =>
    api.post(`/entries/${entryId}/objectives/${objectiveId}/confirm`),
  );
}

/** Remove an entry↔objective link. */
export function useRemoveEntryObjective(entryId: string, placementId?: string) {
  return useEntryLinkMutation(entryId, placementId, (objectiveId: string) =>
    api.delete(`/entries/${entryId}/objectives/${objectiveId}`),
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types (mirror the new weekly-entry pipeline: modules/entries) ──
export type EntryStatus = 'draft' | 'submitted' | 'returned' | 'acknowledged';

export interface EntryActivity {
  id?:            string;
  activityDate:   string; // YYYY-MM-DD (API returns ISO; we slice to date)
  description:    string;
  competencyTags: string[];
}

export interface EntryReflection {
  learning:          string;
  challenges:        string;
  supervisorVisible: boolean;
}

export type DayStatus = 'draft' | 'submitted';

export interface EntryDay {
  id:          string;
  date:        string;       // ISO; slice to YYYY-MM-DD
  status:      DayStatus;
  submittedAt: string | null;
  loggedLate:  boolean;
}

export interface EntryEvent {
  id:         string;
  fromStatus: EntryStatus | null;
  toStatus:   EntryStatus;
  comment:    string | null;
  score:      string | number | null;
  createdAt:  string;
}

export interface EntryAssessment {
  id:        string;
  relevance: string | number | null;
  summary:   unknown;
  createdAt: string;
}

export interface LogbookEntry {
  id:          string;
  placementId: string;
  weekNumber:  number;
  periodStart: string;
  periodEnd:   string;
  status:      EntryStatus;
  hoursLogged: string | number | null;
  version:     number;
  submittedAt: string | null;
  createdAt:   string;
  updatedAt:   string;
  activities?: EntryActivity[];
  reflection?: EntryReflection | null;
  events?:     EntryEvent[];
  assessments?: EntryAssessment[];
  days?:       EntryDay[];
  _count?:     { activities: number };
  // Present on the list endpoint (used by the supervisor review queue).
  placement?: {
    id:      string;
    student?: { id: string; firstName: string; lastName: string; email: string };
    company?: { name: string };
  };
}

export interface SaveDraftPayload {
  placementId: string;
  weekNumber:  number;
  periodStart: string;
  periodEnd:   string;
  hoursLogged?: number;
  activities:  EntryActivity[];
  reflection?: EntryReflection;
}

// List every week for a placement. The internship is a fixed 6-week programme,
// so limit=12 comfortably covers every week with headroom.
export function useEntries(placementId: string | undefined) {
  return useQuery({
    queryKey: ['entries', 'list', placementId],
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookEntry[] }>(
        `/entries?placementId=${placementId}&limit=12`,
      );
      return r.data.data;
    },
  });
}

export function useEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: ['entries', 'detail', entryId],
    enabled:  !!entryId,
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookEntry }>(`/entries/${entryId}`);
      return r.data.data;
    },
  });
}

export function useSaveEntryDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveDraftPayload) => {
      const r = await api.post<{ data: LogbookEntry }>('/entries', payload);
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries', 'list', entry.placementId] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

export function useSubmitEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const r = await api.post<{ data: LogbookEntry }>(`/entries/${entryId}/submit`);
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

// ── Per-day path ──
// One day's activities (the day is the submittable unit). Saving upserts the
// owning week and replaces just this day's activities.
export interface SaveDayPayload {
  placementId: string;
  weekNumber:  number;
  periodStart: string;
  periodEnd:   string;
  date:        string; // YYYY-MM-DD
  activities:  { description: string; competencyTags: string[] }[];
}

export function useSaveDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveDayPayload) => {
      const r = await api.post<{ data: LogbookEntry }>('/entries/days', payload);
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries', 'list', entry.placementId] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

export function useSubmitDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, date }: { entryId: string; date: string }) => {
      const r = await api.post<{ data: LogbookEntry }>(`/entries/${entryId}/days/submit`, { date });
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries', 'list', entry.placementId] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

// ── Supervisor side ──
// Submitted entries awaiting review. The API scopes by role at the DB layer, so
// an academic supervisor only sees entries on their own assigned placements.
export function useReviewQueue(status: EntryStatus = 'submitted') {
  return useQuery({
    queryKey: ['entries', 'queue', status],
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookEntry[] }>(`/entries?status=${status}&limit=100`);
      return r.data.data;
    },
  });
}

export function useAcknowledgeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, comment, score }: { entryId: string; comment?: string; score?: number }) => {
      const r = await api.post<{ data: LogbookEntry }>(`/entries/${entryId}/acknowledge`, { comment, score });
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

export function useReturnEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, comment }: { entryId: string; comment: string }) => {
      const r = await api.post<{ data: LogbookEntry }>(`/entries/${entryId}/return`, { comment });
      return r.data.data;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries'] });
      qc.invalidateQueries({ queryKey: ['entries', 'detail', entry.id] });
    },
  });
}

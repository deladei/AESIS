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

/**
 * One day row as the API actually sends it — a `daily_entry`, not the dropped
 * `entry_days`. The field is `workDate`; there is no stored `loggedLate`
 * (lateness is derived from the immutable `createdAt`, server-side, and sent
 * alongside). Getting this wrong is not a type error at build time, so it is
 * worth stating: these names must match `DailyEntry` in schema.prisma.
 */
export interface EntryDay {
  id:          string;
  workDate:    string;       // ISO; slice to YYYY-MM-DD
  status:      DayStatus;
  submittedAt: string | null;
  createdAt:   string;
  /** Derived server-side in getEntry — first logged past the day's grace window. */
  loggedLate:  boolean;
  /** How many whole days after the work date it was first logged. 0 when on time. */
  lateByDays:  number;
}

/** The day's key for comparing against a calendar date. Never throws. */
export const dayKey = (d: Pick<EntryDay, 'workDate'>): string => (d.workDate ?? '').slice(0, 10);

export interface EntryEvent {
  id:         string;
  fromStatus: EntryStatus | null;
  toStatus:   EntryStatus;
  comment:    string | null;
  score:      string | number | null;
  createdAt:  string;
}

// 6-dimension rubric breakdown (0–100 each). Advisory only — never a grade.
export interface QualityBreakdown {
  overall: number;
  task_depth: number;
  tech_vocab: number;
  reflection: number;
  temporal_consistency: number;
  relevance: number;
  flags?: string[];
  feedback?: string;
}

export interface PlagiarismMatch {
  entry_id: string;
  similarity: number;
  tfidf_similarity: number;
  semantic_similarity: number | null;
  same_student: boolean;
}

export interface PlagiarismReport {
  checked: boolean;
  corpus_size: number;
  max_similarity: number;
  flagged: boolean;
  matches: PlagiarismMatch[];
}

// Draft for the supervisor to edit before sending — never auto-sent.
export interface FeedbackDraft {
  text: string;
  model: string;
}

export interface EntryAssessment {
  id:        string;
  relevance: string | number | null;
  summary:   unknown;
  // Report fields ship with aesis-entry-enrichment/v2; older assessments and
  // student/company reads (plagiarism + draft are redacted server-side) carry null.
  quality?:       QualityBreakdown | null;
  plagiarism?:    PlagiarismReport | null;
  feedbackDraft?: FeedbackDraft | null;
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
  /**
   * Draft weeks only (the detail endpoint). Whether every working day of the
   * week is accounted for, so the logbook can offer "submit week" on load
   * rather than only on the save that completed it.
   */
  completion?: {
    complete: boolean;
    remaining: number;
    workingDays: number;
    /** The unaccounted-for working days, YYYY-MM-DD — named for the student
     *  before they submit a week with gaps. */
    missingDates: string[];
  } | null;
  /** Detail endpoint: the week's late headline, rolled up from `days`. */
  lateSummary?: { lateDays: number; maxDaysLate: number };
  /** List endpoint: the same headline, so the review queue can show lateness
   *  without fetching every week. */
  lateDays?:    number;
  maxDaysLate?: number;
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

// List every week for a placement in one page. `limit=12` assumed the fixed
// 6-week programme; cohorts configure 24, so weeks 13+ silently fell off the
// student's week rail, the supervisor's finalization list and every badge that
// rides those rows. 100 is the API's own maximum and covers any cohort length
// the schema permits.
export function useEntries(placementId: string | undefined) {
  return useQuery({
    queryKey: ['entries', 'list', placementId],
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: LogbookEntry[] }>(
        `/entries?placementId=${placementId}&limit=100`,
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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types (mirror modules/siwes serializers) ──────────────────

export type DayClass =
  | 'working'
  | 'weekly_rest'
  | 'non_working'
  | 'before_attachment'
  | 'after_attachment';

export type AbsenceKind = 'sick' | 'permitted' | 'unexcused';

export interface SiwesDailyEntry {
  id:                string;
  placementId:       string;
  weekNumber:        number;
  workDate:          string; // YYYY-MM-DD
  descriptionOfWork: string;
  newSkillsLearnt:   string;
  sketchUrl:         string | null;
  clientDraftedAt:   string | null;
  createdAt:         string;
  updatedAt:         string;
  loggedLate:        boolean;
  lateByDays:        number;
  editableUntil:     string;
}

export interface SiwesAbsence {
  id:           string;
  kind:         AbsenceKind;
  reason:       string | null;
  recordedById: string | null;
}

export interface SiwesCalendarDay {
  date:       string; // YYYY-MM-DD
  weekNumber: number;
  class:      DayClass;
  entry:      SiwesDailyEntry | null;
  absence:    SiwesAbsence | null;
  missing:    boolean;
}

export interface SiwesWeeklySummary {
  id:         string;
  weekNumber: number;
  weekEnding: string;
  reportText: string;
  createdAt:  string;
  updatedAt:  string;
}

export interface SiwesCalendar {
  placementId:     string;
  chainStart:      string;
  chainEnd:        string;
  totalWeeks:      number;
  days:            SiwesCalendarDay[];
  weeklySummaries: SiwesWeeklySummary[];
}

// ── Queries ───────────────────────────────────────────────────

const calendarKey = (placementId: string | undefined) => ['siwes-calendar', placementId];

export function useSiwesCalendar(placementId: string | undefined) {
  return useQuery({
    queryKey: calendarKey(placementId),
    enabled:  !!placementId,
    queryFn:  async () => {
      const r = await api.get<{ data: SiwesCalendar }>(
        `/siwes/placements/${placementId}/calendar`,
      );
      return r.data.data;
    },
  });
}

// ── Mutations (each invalidates the calendar — the single source) ──

export interface SaveDailyEntryInput {
  placementId:       string;
  workDate:          string; // YYYY-MM-DD
  descriptionOfWork: string;
  newSkillsLearnt:   string;
  sketchUrl?:        string;
}

export function useSaveDailyEntry(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDailyEntryInput) => {
      const r = await api.put<{ data: SiwesDailyEntry }>('/siwes/days', input);
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKey(placementId) }),
  });
}

export interface SaveWeeklySummaryInput {
  placementId: string;
  weekNumber:  number;
  reportText:  string;
}

export function useSaveWeeklySummary(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveWeeklySummaryInput) => {
      const r = await api.put<{ data: SiwesWeeklySummary }>('/siwes/weeks/summary', input);
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKey(placementId) }),
  });
}

export interface RecordAbsenceInput {
  placementId: string;
  absenceDate: string; // YYYY-MM-DD
  kind:        Exclude<AbsenceKind, 'unexcused'>; // students self-report sick/permitted only
  reason?:     string;
}

export function useRecordAbsence(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordAbsenceInput) => {
      const r = await api.post<{ data: SiwesAbsence }>('/siwes/absences', input);
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: calendarKey(placementId) }),
  });
}

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

/**
 * The API reports whether this save completed the week. It does not submit —
 * the student is asked. A completed week they never send is picked up by the
 * deadline job (backend jobs/weekAutoSubmit.ts), so choosing to review first
 * cannot turn into a late mark.
 */
export interface SavedDailyEntry extends SiwesDailyEntry {
  /** Every working day of the week is now accounted for. */
  weekComplete: boolean;
  weekEntryId: string;
  daysRemainingInWeek: number;
  workingDaysInWeek: number;
}

export function useSaveDailyEntry(placementId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDailyEntryInput) => {
      const r = await api.put<{ data: SavedDailyEntry }>('/siwes/days', input);
      return r.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: calendarKey(placementId) });
      // The week's status may have just changed under the entries spine.
      qc.invalidateQueries({ queryKey: ['entries'] });
    },
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

// ── Cohort holiday calendar (coordinator configuration) ───────

export interface NonWorkingDay {
  id:             string;
  academicYearId: string;
  day:            string; // ISO
  label:          string;
}

const nwdKey = (academicYearId: string | undefined) => ['siwes-non-working-days', academicYearId];

export function useNonWorkingDays(academicYearId: string | undefined) {
  return useQuery({
    queryKey: nwdKey(academicYearId),
    enabled:  !!academicYearId,
    queryFn:  async () => {
      const r = await api.get<{ data: NonWorkingDay[] }>('/siwes/non-working-days', {
        params: { academicYearId },
      });
      return r.data.data;
    },
  });
}

export function useCreateNonWorkingDay(academicYearId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { day: string; label: string }) => {
      const r = await api.post<{ data: NonWorkingDay }>('/siwes/non-working-days', {
        academicYearId,
        ...input,
      });
      return r.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: nwdKey(academicYearId) }),
  });
}

export function useDeleteNonWorkingDay(academicYearId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/siwes/non-working-days/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: nwdKey(academicYearId) }),
  });
}

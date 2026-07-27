import { z } from 'zod';
import { weekNumberCeiling, freeText, optionalFreeText } from '../../shared/validation';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// Upsert one day of the SIWES daily logbook (Weekly Progress Chart row).
// The fields mirror the instrument: Description of Work Done / New Skills
// Learnt (+ optional sketch). clientDraftedAt is the student's offline-draft
// CLAIM — forgeable, displayed as a nudge, never a control.
export const saveDailyEntrySchema = z.object({
  placementId: z.string().uuid(),
  workDate: dateOnly,
  descriptionOfWork: freeText(10000, 'Description of work done'),
  newSkillsLearnt: freeText(10000, 'New skills learnt'),
  sketchUrl: z.string().trim().url().max(2048).optional(),
  clientDraftedAt: z.string().datetime().optional(),
});
export type SaveDailyEntryInput = z.infer<typeof saveDailyEntrySchema>;

// Upsert the "Trainee's Weekly Report" — one free-text summary per week.
// weekEnding is derived server-side from the chain calendar, never supplied.
export const saveWeeklySummarySchema = z.object({
  placementId: z.string().uuid(),
  // Ceiling only — the attachment's real span is enforced in the service
  // against the cohort calendar (see saveWeeklySummary).
  weekNumber: weekNumberCeiling(),
  reportText: freeText(20000, 'Weekly report'),
});
export type SaveWeeklySummaryInput = z.infer<typeof saveWeeklySummarySchema>;

// Record an absence. Students self-report sick/permitted on their own
// placement; staff may record any kind (incl. unexcused). A reason is
// mandatory for permitted absences ("permission" implies a stated ground).
export const recordAbsenceSchema = z
  .object({
    placementId: z.string().uuid(),
    absenceDate: dateOnly,
    kind: z.enum(['sick', 'permitted', 'unexcused']),
    reason: optionalFreeText(2000, 'Reason'),
  })
  .refine((v) => v.kind !== 'permitted' || v.reason !== undefined, {
    message: 'A permitted absence requires a reason',
    path: ['reason'],
  });
export type RecordAbsenceInput = z.infer<typeof recordAbsenceSchema>;

// Cohort holiday calendar (coordinator-managed).
export const createNonWorkingDaySchema = z.object({
  academicYearId: z.string().uuid(),
  day: dateOnly,
  label: freeText(200, 'Label'),
});
export type CreateNonWorkingDayInput = z.infer<typeof createNonWorkingDaySchema>;

export const listNonWorkingDaysQuerySchema = z.object({
  academicYearId: z.string().uuid(),
});

// Calendar / listing ranges.
export const calendarQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

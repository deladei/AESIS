import { z } from 'zod';

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
  descriptionOfWork: z.string().trim().min(1).max(10000),
  newSkillsLearnt: z.string().trim().min(1).max(10000),
  sketchUrl: z.string().trim().url().max(2048).optional(),
  clientDraftedAt: z.string().datetime().optional(),
});
export type SaveDailyEntryInput = z.infer<typeof saveDailyEntrySchema>;

// Upsert the "Trainee's Weekly Report" — one free-text summary per week.
// weekEnding is derived server-side from the chain calendar, never supplied.
export const saveWeeklySummarySchema = z.object({
  placementId: z.string().uuid(),
  weekNumber: z.number().int().min(1).max(52),
  reportText: z.string().trim().min(1).max(20000),
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
    reason: z.string().trim().min(1).max(2000).optional(),
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
  label: z.string().trim().min(1).max(200),
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

import { z } from 'zod';
import { weekNumberCeiling, weekHours, freeText, optionalFreeText } from '../../shared/validation';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const activitySchema = z.object({
  activityDate: dateOnly,
  description: freeText(5000, 'Description'),
  competencyTags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

export const reflectionSchema = z.object({
  learning: freeText(10000, 'What you learned'),
  challenges: freeText(10000, 'Challenges'),
  supervisorVisible: z.boolean().default(true),
});

// Create-or-update a draft for a given week of a placement.
export const saveDraftSchema = z.object({
  placementId: z.string().uuid(),
  // Sanity ceiling only — the real bound is the cohort's attachment span and is
  // enforced in the service (assertWeekWithinAttachment). It used to be a hard
  // max(6), which made week 7 unsaveable for a 24-week cohort.
  weekNumber: weekNumberCeiling(),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  hoursLogged: weekHours.optional(),
  activities: z.array(activitySchema).max(50).default([]),
  reflection: reflectionSchema.optional(),
});

export const submitSchema = z.object({}).optional();

// ── Per-day path ──────────────────────────────────────────────
// One day's activities (the day is the submittable unit). The day's date is the
// route/body `date`, so per-activity dates aren't needed here.
export const dayActivitySchema = z.object({
  description: freeText(5000, 'Description'),
  competencyTags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

// Save a single day's draft. Upserts the owning week entry, then replaces just
// this day's activities — other days are untouched.
export const saveDaySchema = z.object({
  placementId: z.string().uuid(),
  // Sanity ceiling only — the real bound is the cohort's attachment span and is
  // enforced in the service (assertWeekWithinAttachment). It used to be a hard
  // max(6), which made week 7 unsaveable for a 24-week cohort.
  weekNumber: weekNumberCeiling(),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  date: dateOnly,
  activities: z.array(dayActivitySchema).max(20).default([]),
});

export const submitDaySchema = z.object({
  date: dateOnly,
});

// ── Reflection path ───────────────────────────────────────────
// The week's challenges, written on their own. It is deliberately NOT part of
// saveDraftSchema: that route replaces every activity in the week on each save,
// so a student saving only a reflection through it would wipe the days the
// per-day path wrote. This upserts the owning week the same way saveDay does.
export const saveReflectionSchema = z.object({
  placementId: z.string().uuid(),
  weekNumber: weekNumberCeiling(),
  challenges: freeText(10000, 'Challenges'),
  // Both columns are non-null on entry_reflection; learning stays optional here
  // so a student can record a challenge without also being made to write a
  // lesson. Absent means "leave whatever is stored", '' on first write.
  learning: optionalFreeText(10000, 'What you learned'),
  supervisorVisible: z.boolean().optional(),
});

export const returnSchema = z.object({
  comment: freeText(5000, 'Comment'),
});

export const acknowledgeSchema = z.object({
  comment: z.string().trim().max(5000).optional(),
  // Only honored when WEEKLY_BINDING_GRADES is on; required in that mode.
  score: z.number().min(0).max(100).optional(),
});

export const listQuerySchema = z.object({
  placementId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'returned', 'acknowledged']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type SaveDayInput = z.infer<typeof saveDaySchema>;
export type SubmitDayInput = z.infer<typeof submitDaySchema>;
export type SaveReflectionInput = z.infer<typeof saveReflectionSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type AcknowledgeInput = z.infer<typeof acknowledgeSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

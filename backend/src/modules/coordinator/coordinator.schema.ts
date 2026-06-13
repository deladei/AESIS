import { z } from 'zod';

// Cohort configuration the coordinator can edit for the active academic year.
//  • minWeeklyHours       — per-week minimum attendance hours. 0 disables the
//    intern dashboard's shortfall flag. Capped at 168 (hours in a week).
//  • performanceThreshold — logbook quality score (0–100) below which an intern
//    is flagged as needing attention. 0 disables the low-score signal.
// Both optional, but at least one must be present (nothing to save otherwise).
export const updateCohortConfigSchema = z
  .object({
    minWeeklyHours:       z.coerce.number().int().min(0).max(168).optional(),
    performanceThreshold: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((v) => v.minWeeklyHours !== undefined || v.performanceThreshold !== undefined, {
    message: 'Provide at least one setting to update',
  });

export type UpdateCohortConfigInput = z.infer<typeof updateCohortConfigSchema>;

import { z } from 'zod';

// Per-week minimum attendance hours a cohort must log. 0 disables the intern
// dashboard's shortfall flag (no minimum configured). Capped at 168 — the
// number of hours in a week — so an impossible target can't be saved.
export const updateCohortConfigSchema = z.object({
  minWeeklyHours: z.coerce.number().int().min(0).max(168),
});

export type UpdateCohortConfigInput = z.infer<typeof updateCohortConfigSchema>;

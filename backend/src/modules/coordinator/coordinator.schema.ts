import { z } from 'zod';

// Cohort configuration the coordinator can edit for the active academic year.
//  • minWeeklyHours       — per-week minimum attendance hours. 0 disables the
//    intern dashboard's shortfall flag. Capped at 168 (hours in a week).
//  • performanceThreshold — logbook quality score (0–100) below which an intern
//    is flagged as needing attention. 0 disables the low-score signal.
//  • weight{Industry,University,Report,Logbook} — final-grade aggregation
//    weights (percentage points). All-or-nothing: if any one is sent, all four
//    must be sent and sum to exactly 100, so the aggregation is never left in an
//    invalid partial state. Affects future aggregations only (released grades
//    are immutable; draft grades pick up new weights on the next Aggregate).
// All optional, but at least one field must be present (nothing to save otherwise).
const WEIGHT_KEYS = ['weightIndustry', 'weightUniversity', 'weightReport', 'weightLogbook'] as const;

export const updateCohortConfigSchema = z
  .object({
    minWeeklyHours:       z.coerce.number().int().min(0).max(168).optional(),
    performanceThreshold: z.coerce.number().int().min(0).max(100).optional(),
    weightIndustry:       z.coerce.number().int().min(0).max(100).optional(),
    weightUniversity:     z.coerce.number().int().min(0).max(100).optional(),
    weightReport:         z.coerce.number().int().min(0).max(100).optional(),
    weightLogbook:        z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one setting to update',
  })
  .refine(
    (v) => {
      const provided = WEIGHT_KEYS.filter((k) => v[k] !== undefined);
      return provided.length === 0 || provided.length === 4;
    },
    { message: 'All four grade weights must be provided together', path: ['weightIndustry'] },
  )
  .refine(
    (v) => {
      const provided = WEIGHT_KEYS.filter((k) => v[k] !== undefined);
      if (provided.length !== 4) return true;
      return WEIGHT_KEYS.reduce((sum, k) => sum + (v[k] as number), 0) === 100;
    },
    { message: 'Grade weights must sum to exactly 100', path: ['weightIndustry'] },
  );

export type UpdateCohortConfigInput = z.infer<typeof updateCohortConfigSchema>;

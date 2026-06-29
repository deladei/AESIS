import { z } from 'zod';

// The four weighted components of the final grade. `industry` is supplied by the
// tokenised company supervisor (Batch B) or, interim, by the coordinator;
// `university` / `report` / `logbook` are entered by the assigned academic
// supervisor. Every raw score is on a 0–100 scale.
export const GRADE_COMPONENTS = ['industry', 'university', 'report', 'logbook'] as const;
export type GradeComponent = (typeof GRADE_COMPONENTS)[number];

// Enter / update a single component's raw score.
export const componentScoreSchema = z.object({
  component: z.enum(GRADE_COMPONENTS),
  raw: z.number().min(0).max(100),
});

// Coordinator override of the aggregated total. A reason is mandatory and is
// recorded on the grade + in the audit log — an override is never silent.
export const overrideSchema = z.object({
  total: z.number().min(0).max(100),
  reason: z.string().trim().min(1).max(2000),
});

export type ComponentScoreInput = z.infer<typeof componentScoreSchema>;
export type OverrideInput = z.infer<typeof overrideSchema>;

import { z } from 'zod';

// Academic supervisor records the binding placement assessment.
export const assessmentSchema = z.object({
  grade: z.string().trim().min(1).max(20),
  narrative: z.string().trim().max(10000).optional(),
});

// Finalize a placement. Any week not acknowledged must be explicitly waived
// with a recorded reason.
export const finalizeSchema = z.object({
  waivers: z
    .array(
      z.object({
        weekNumber: z.number().int().min(1).max(104),
        reason: z.string().trim().min(1).max(2000),
      }),
    )
    .max(104)
    .default([]),
});

// Public attestation submission (company supervisor, no account).
export const attestSchema = z.object({
  confirmed: z.boolean(),
  comment: z.string().trim().max(5000).optional(),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;
export type FinalizeInput = z.infer<typeof finalizeSchema>;
export type AttestInput = z.infer<typeof attestSchema>;

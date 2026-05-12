import { z } from 'zod';

export const saveDraftSchema = z.object({
  tasksCompleted:    z.string().min(1).max(5000),
  technologiesUsed:  z.string().min(1).max(2000),
  challenges:        z.string().max(3000).optional(),
  reflection:        z.string().max(3000).optional(),
  hoursWorked:       z.number().int().min(0).max(168).optional(),
});

export const submitLogbookSchema = z.object({
  // No body required — submits the existing draft for the given submissionId
});

export const feedbackSchema = z.object({
  feedbackText: z.string().min(10).max(5000),
  rating:       z.number().int().min(1).max(5).optional(),
  outcome:      z.enum(['approved', 'flagged']),
});

export const weekParamSchema = z.object({
  weekNumber: z.coerce.number().int().min(1).max(24),
});

export type SaveDraftInput     = z.infer<typeof saveDraftSchema>;
export type FeedbackInput      = z.infer<typeof feedbackSchema>;

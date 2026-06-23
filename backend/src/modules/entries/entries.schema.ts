import { z } from 'zod';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const activitySchema = z.object({
  activityDate: dateOnly,
  description: z.string().trim().min(1).max(5000),
  competencyTags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

export const reflectionSchema = z.object({
  learning: z.string().trim().min(1).max(10000),
  challenges: z.string().trim().min(1).max(10000),
  supervisorVisible: z.boolean().default(true),
});

// Create-or-update a draft for a given week of a placement.
export const saveDraftSchema = z.object({
  placementId: z.string().uuid(),
  weekNumber: z.number().int().min(1).max(6),
  periodStart: dateOnly,
  periodEnd: dateOnly,
  hoursLogged: z.number().min(0).max(168).optional(),
  activities: z.array(activitySchema).max(50).default([]),
  reflection: reflectionSchema.optional(),
});

export const submitSchema = z.object({}).optional();

export const returnSchema = z.object({
  comment: z.string().trim().min(1).max(5000),
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

export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type AcknowledgeInput = z.infer<typeof acknowledgeSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;

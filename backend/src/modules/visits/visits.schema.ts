import { z } from 'zod';

export const visitType = z.enum(['site_visit', 'review_meeting', 'midterm_review', 'final_review', 'check_in']);

export const createVisitSchema = z.object({
  placementId:     z.string().uuid(),
  scheduledAt:     z.string().datetime(),
  visitType:       visitType.default('review_meeting'),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  location:        z.string().trim().max(200).optional(),
  notes:           z.string().trim().max(2000).optional(),
});

export const updateVisitSchema = z.object({
  scheduledAt:     z.string().datetime().optional(),
  visitType:       visitType.optional(),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
  location:        z.string().trim().max(200).nullable().optional(),
  notes:           z.string().trim().max(2000).nullable().optional(),
});

export const completeVisitSchema = z.object({
  outcomeNote: z.string().trim().max(2000).optional(),
});

export const cancelVisitSchema = z.object({
  cancelReason: z.string().trim().min(3).max(500),
});

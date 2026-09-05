import { z } from 'zod';

export const approvalKind = z.enum(['leave', 'extension', 'supervisor_change', 'training_plan']);

export const createApprovalSchema = z.object({
  placementId:   z.string().uuid(),
  kind:          approvalKind,
  title:         z.string().trim().min(3).max(200),
  reason:        z.string().trim().min(5).max(2000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payload:       z.record(z.unknown()).optional(),
});

export const decideApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note:     z.string().trim().max(1000).optional(),
});

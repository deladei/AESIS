import { z } from 'zod';
import { REGION_VALUES } from '../../shared/constants/regions';

export const regionSchema = z.enum(REGION_VALUES);

export const createPlacementSchema = z.object({
  companyName:            z.string().trim().min(2).max(200),
  companyAddress:         z.string().trim().min(5).max(500),
  companySupervisorName:  z.string().trim().min(2).max(100),
  companySupervisorEmail: z.string().email(),
  region:                 regionSchema,
  startDate:              z.string().date('Invalid start date (YYYY-MM-DD)'),
  endDate:                z.string().date('Invalid end date (YYYY-MM-DD)'),
}).refine((d) => new Date(d.endDate) > new Date(d.startDate), {
  message: 'End date must be after start date',
  path: ['endDate'],
});

// `transferred_out` is deliberately absent: it is reachable only through an
// approved transfer request, never set by hand. `cancelled` is the logbook's
// "any attachment not properly authorized will be cancelled" — its weeks do
// NOT count toward the minimum, so it requires a reason like a rejection.
export const updatePlacementStatusSchema = z.object({
  status:          z.enum(['active', 'rejected', 'completed', 'withdrawn', 'failed', 'cancelled']),
  rejectionReason: z.string().min(10).max(1000).optional(),
  supervisorId:    z.string().uuid().optional(),
}).refine(
  (d) => !['rejected', 'cancelled'].includes(d.status) || !!d.rejectionReason,
  { message: 'A reason is required when rejecting or cancelling a placement', path: ['rejectionReason'] },
);

export const assignSupervisorSchema = z.object({
  supervisorId: z.string().uuid(),
  // Which supervisor slot to assign. Defaults to 'academic' so the existing
  // coordinator UI (which sends only supervisorId) keeps working unchanged.
  kind:         z.enum(['academic', 'company']).default('academic'),
});

// ── Change of attachment (transfer) ───────────────────────────

export const createTransferRequestSchema = z.object({
  newCompanyName:         z.string().trim().min(2).max(200),
  // The logbook requires the full address, not just a P.O. box.
  newCompanyAddress:      z.string().trim().min(5).max(500),
  reason:                 z.string().trim().min(10).max(1000),
  authorizationLetterUrl: z.string().url().optional(),
});

export const decideTransferRequestSchema = z.object({
  decision:               z.enum(['approved', 'rejected']),
  decisionNote:           z.string().trim().max(1000).optional(),
  // May be supplied at decision time if the student did not attach it.
  authorizationLetterUrl: z.string().url().optional(),
  // Coordinator reads the successor's region off the new address; defaults to
  // the old placement's region when omitted.
  newRegion:              regionSchema.optional(),
  supervisorId:           z.string().uuid().optional(),
}).refine(
  (d) => d.decision !== 'rejected' || !!d.decisionNote,
  { message: 'A note is required when rejecting a transfer request', path: ['decisionNote'] },
);

export const createCompanySchema = z.object({
  name:     z.string().trim().min(2).max(200),
  address:  z.string().trim().max(500).optional(),
  industry: z.string().trim().max(100).optional(),
  website:  z.string().url().optional().or(z.literal('')),
});

export type CreatePlacementInput       = z.infer<typeof createPlacementSchema>;
export type UpdatePlacementStatusInput = z.infer<typeof updatePlacementStatusSchema>;
// z.input (not infer): `kind` is optional on the wire — the schema defaults it
// to 'academic', and the service treats an absent kind as the academic slot.
export type AssignSupervisorInput      = z.input<typeof assignSupervisorSchema>;
export type CreateCompanyInput         = z.infer<typeof createCompanySchema>;
export type CreateTransferRequestInput = z.infer<typeof createTransferRequestSchema>;
export type DecideTransferRequestInput = z.infer<typeof decideTransferRequestSchema>;

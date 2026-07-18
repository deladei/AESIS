import { z } from 'zod';

// Industry supervisor RECORDS (no account). Contact details come from the
// student, so nothing here may touch verification_status — verification has its
// own staff-only endpoints. Zod strips unknown keys by default, but the service
// additionally never forwards a status field from these inputs.

export const createIndustrySupervisorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional(),
  departmentUnit: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
}).refine(
  (v) => !(v.periodStart && v.periodEnd) || v.periodStart <= v.periodEnd,
  { message: 'periodStart must not be after periodEnd' },
);

export const updateIndustrySupervisorSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  designation: z.string().trim().max(120).nullish(),
  departmentUnit: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.string().trim().toLowerCase().email().max(254).nullish(),
  periodStart: z.coerce.date().nullish(),
  periodEnd: z.coerce.date().nullish(),
});

// Coordinator/HoD decision. visit_confirmed is NOT settable here — it comes
// only from the assigned academic supervisor's visit-confirm endpoint.
export const verifySupervisorSchema = z.object({
  status: z.enum(['coordinator_approved', 'rejected']),
  note: z.string().trim().max(500).optional(),
});

export const visitConfirmSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type CreateIndustrySupervisorInput = z.infer<typeof createIndustrySupervisorSchema>;
export type UpdateIndustrySupervisorInput = z.infer<typeof updateIndustrySupervisorSchema>;
export type VerifySupervisorInput = z.infer<typeof verifySupervisorSchema>;
export type VisitConfirmInput = z.infer<typeof visitConfirmSchema>;

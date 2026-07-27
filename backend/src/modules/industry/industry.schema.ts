import { z } from 'zod';
import {
  ASSESSMENT_INDUSTRY_MAXIMA as M, personName, optionalFreeText,
  organisationName, email as emailField, ghanaPhone, weekNumberCeiling, freeText,
} from '../../shared/validation';

// Industry supervisor RECORDS (no account). Contact details come from the
// student, so nothing here may touch verification_status — verification has its
// own staff-only endpoints. Zod strips unknown keys by default, but the service
// additionally never forwards a status field from these inputs.

export const createIndustrySupervisorSchema = z.object({
  name: personName('Supervisor name', 120),
  designation: optionalFreeText(120, 'Designation'),
  departmentUnit: optionalFreeText(120, 'Department or unit'),
  phone: ghanaPhone('Supervisor phone').optional(),
  email: emailField('Supervisor email').optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
}).refine(
  (v) => !(v.periodStart && v.periodEnd) || v.periodStart <= v.periodEnd,
  { message: 'periodStart must not be after periodEnd' },
);

export const updateIndustrySupervisorSchema = z.object({
  name: personName('Supervisor name', 120).optional(),
  designation: optionalFreeText(120, 'Designation').nullish(),
  departmentUnit: optionalFreeText(120, 'Department or unit').nullish(),
  phone: ghanaPhone('Supervisor phone').nullish(),
  email: emailField('Supervisor email').nullish(),
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

// The Industrial Attachment Performance Evaluation Form — criteria maxima
// verbatim from the instrument. Zod bounds mirror the DB CHECKs so a violation
// fails fast with a readable message instead of a constraint error.
const criterion = (max: number, label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} cannot exceed ${max}`);

export const industryAssessmentScoresSchema = z.object({
  attendance: criterion(M.attendance, 'Attendance'),
  punctuality: criterion(M.punctuality, 'Punctuality'),
  cooperation: criterion(M.cooperation, 'Cooperation'),
  aptitude: criterion(M.aptitude, 'Aptitude'),
  understanding: criterion(M.understanding, 'Understanding'),
  safety: criterion(M.safety, 'Safety'),
  autonomy: criterion(M.autonomy, 'Autonomy'),
  additionalComments: optionalFreeText(2000, 'Additional comments'),
  reportingOfficerName: personName('Reporting officer name', 120),
  reportingOfficerDesignation: optionalFreeText(120, 'Designation'),
  companyHodName: personName('Company HOD name', 120).optional(),
});

// Paper path: the coordinator keys in a scanned form. The scan is the evidence.
export const paperAssessmentSchema = industryAssessmentScoresSchema.extend({
  industrySupervisorId: z.string().uuid(),
  scanUrl: z.string().url().max(2000),
});

export type IndustryAssessmentScores = z.infer<typeof industryAssessmentScoresSchema>;
export type PaperAssessmentInput = z.infer<typeof paperAssessmentSchema>;

// Weekly comment (formative — the student reads it). Digital path carries only
// the comment: week, supervisor and date all come from the token/record, never
// the body. Paper path mirrors the paper assessment: scan is the evidence.
export const digitalWeeklyCommentSchema = z.object({
  comment: freeText(2000, 'Comment').min(3, 'Comment is too short'),
});

export const paperWeeklyCommentSchema = digitalWeeklyCommentSchema.extend({
  industrySupervisorId: z.string().uuid(),
  weekNumber: weekNumberCeiling(),
  commentDate: z.coerce.date(),
  scanUrl: z.string().url().max(2000),
  // Snapshot overrides for when the paper form names someone other than the
  // current record (unit rotation); default to the supervisor record.
  supervisorName: personName('Supervisor name', 120).optional(),
  departmentUnit: optionalFreeText(120, 'Department or unit'),
});

export type DigitalWeeklyCommentInput = z.infer<typeof digitalWeeklyCommentSchema>;
export type PaperWeeklyCommentInput = z.infer<typeof paperWeeklyCommentSchema>;

export type CreateIndustrySupervisorInput = z.infer<typeof createIndustrySupervisorSchema>;
export type UpdateIndustrySupervisorInput = z.infer<typeof updateIndustrySupervisorSchema>;
export type VerifySupervisorInput = z.infer<typeof verifySupervisorSchema>;
export type VisitConfirmInput = z.infer<typeof visitConfirmSchema>;

import { z } from 'zod';
import { REGION_VALUES } from '../constants/regions';
import {
  personName, organisationName, email as emailOf, ghanaPhone,
  indexNumber as indexNumberField, staffId as staffIdField, freeText,
  newPassword, offeredPassword,
} from './fields';

// Registration + profile shapes live here, not in the auth module, because the
// SPA parses them too (aliased as @shared) — one definition, one set of
// messages, client and server. The server re-parses on every request; the
// client copy is only there to show the error next to the field.

// Roles that may be picked at self-registration. `coordinator` and `admin`
// are intentionally excluded — those must be seeded or invited.
export const SELF_REGISTERABLE_ROLES = ['student', 'academic_supervisor', 'company_supervisor'] as const;

// Email normalization is the same everywhere: trim first so a paste-with-
// whitespace doesn't fail .email(), then lowercase so the DB row from
// registration always matches the lookup at login. Defined once in
// shared/validation and shared verbatim with the SPA.
const emailField = emailOf();

// A student now supplies their full placement (company, region, dates) at
// registration; the placement row is created in the same step and a regional
// academic supervisor is auto-assigned. These are optional on the base object
// and made mandatory for students by the superRefine below.
export const registerSchema = z.object({
  firstName:   personName('First name'),
  lastName:    personName('Last name'),
  email:       emailField,
  password:    newPassword(),
  role:        z.enum(SELF_REGISTERABLE_ROLES),
  gender:      z.enum(['male', 'female', 'other']),
  programmeId: z.string().uuid('Invalid programme ID').optional(),
  // Student university index/matric number (unique). Required for students below.
  indexNumber: indexNumberField.optional(),
  // Academic-supervisor identity. Required for that role below: a university
  // staff ID (unique — one staff record cannot back two accounts) + honorific.
  staffId: staffIdField.optional(),
  title:   z.enum(['Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.']).optional(),
  // Student placement fields
  region:                 z.enum(REGION_VALUES).optional(),
  companyName:            organisationName('Company name').optional(),
  companyAddress:         freeText(500, 'Company address').min(5, 'Company address is too short').optional(),
  companySupervisorName:  personName('Company supervisor name', 100).optional(),
  companySupervisorEmail: emailField.optional(),
  startDate:              z.string().date('Invalid start date (YYYY-MM-DD)').optional(),
  endDate:                z.string().date('Invalid end date (YYYY-MM-DD)').optional(),
}).superRefine((data, ctx) => {
  if (data.role === 'academic_supervisor') {
    if (!data.staffId) ctx.addIssue({ code: 'custom', path: ['staffId'], message: 'Staff ID is required' });
    if (!data.title)   ctx.addIssue({ code: 'custom', path: ['title'],   message: 'Title is required' });
  }
  if (data.role !== 'student') return;
  if (!data.programmeId)            ctx.addIssue({ code: 'custom', path: ['programmeId'],            message: 'Students must select a programme' });
  if (!data.indexNumber)           ctx.addIssue({ code: 'custom', path: ['indexNumber'],           message: 'Index number is required' });
  if (!data.region)                ctx.addIssue({ code: 'custom', path: ['region'],                message: 'Select your placement region' });
  if (!data.companyName)           ctx.addIssue({ code: 'custom', path: ['companyName'],           message: 'Company name is required' });
  if (!data.companyAddress)        ctx.addIssue({ code: 'custom', path: ['companyAddress'],        message: 'Company address is required' });
  if (!data.companySupervisorName) ctx.addIssue({ code: 'custom', path: ['companySupervisorName'], message: 'Company supervisor name is required' });
  if (!data.companySupervisorEmail)ctx.addIssue({ code: 'custom', path: ['companySupervisorEmail'],message: 'Company supervisor email is required' });
  if (!data.startDate)             ctx.addIssue({ code: 'custom', path: ['startDate'],             message: 'Start date is required' });
  if (!data.endDate)               ctx.addIssue({ code: 'custom', path: ['endDate'],               message: 'End date is required' });
  if (data.startDate && data.endDate && new Date(data.endDate) <= new Date(data.startDate)) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after start date' });
  }
});

// Self-service profile edit (PATCH /auth/me). Every field is optional — only
// what's sent is changed. Identity-sensitive fields (email, role, password) are
// intentionally NOT editable here; those have their own flows. `indexNumber` is
// accepted but only applied for students (enforced in the service against the
// authenticated role, since the body can't be trusted to carry it).
export const updateProfileSchema = z.object({
  firstName:   personName('First name').optional(),
  lastName:    personName('Last name').optional(),
  gender:      z.enum(['male', 'female', 'other']).optional(),
  // Phone is PII (AES-256-GCM at rest). Empty string clears it; anything else
  // must be a Ghanaian number and is stored normalised as +233XXXXXXXXX.
  phone:       z.union([z.literal(''), ghanaPhone()]).optional(),
  indexNumber: indexNumberField.optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'No fields to update' },
);


// Sign-in and password recovery. These live here rather than in the auth
// module for the same reason registerSchema does: the SPA parses them too, so
// the message under a field is the message the API would have returned.
export const loginSchema = z.object({
  email:    emailField,
  password: offeredPassword(),
});

export const resetPasswordInitSchema = z.object({
  email: emailField,
});

export const resetPasswordConfirmSchema = z.object({
  token:    z.string().min(1, 'This reset link is missing its token'),
  password: newPassword('New password'),
});

export type RegisterInput      = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type LoginInput                = z.infer<typeof loginSchema>;
export type ResetPasswordInitInput    = z.infer<typeof resetPasswordInitSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

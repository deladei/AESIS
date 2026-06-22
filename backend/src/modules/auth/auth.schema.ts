import { z } from 'zod';
import { REGION_VALUES } from '../../shared/constants/regions';

// Roles that may be picked at self-registration. `coordinator` and `admin`
// are intentionally excluded — those must be seeded or invited.
export const SELF_REGISTERABLE_ROLES = ['student', 'academic_supervisor', 'company_supervisor'] as const;

// Email normalization is the same everywhere: trim first so a paste-with-
// whitespace doesn't fail .email(), then lowercase so the DB row from
// registration always matches the lookup at login.
const emailField = z.string().trim().toLowerCase().pipe(z.string().email());

// A student now supplies their full placement (company, region, dates) at
// registration; the placement row is created in the same step and a regional
// academic supervisor is auto-assigned. These are optional on the base object
// and made mandatory for students by the superRefine below.
export const registerSchema = z.object({
  firstName:   z.string().trim().min(2).max(50),
  lastName:    z.string().trim().min(2).max(50),
  email:       emailField,
  password:    z.string().min(8, 'Password must be at least 8 characters').max(128),
  role:        z.enum(SELF_REGISTERABLE_ROLES),
  gender:      z.enum(['male', 'female', 'other']),
  programmeId: z.string().uuid('Invalid programme ID').optional(),
  // Student university index/matric number (unique). Required for students below.
  indexNumber: z.string().trim().min(3, 'Index number is too short').max(40).optional(),
  // Student placement fields
  region:                 z.enum(REGION_VALUES).optional(),
  companyName:            z.string().trim().min(2).max(200).optional(),
  companyAddress:         z.string().trim().min(5).max(500).optional(),
  companySupervisorName:  z.string().trim().min(2).max(100).optional(),
  companySupervisorEmail: z.string().trim().toLowerCase().pipe(z.string().email()).optional(),
  startDate:              z.string().date('Invalid start date (YYYY-MM-DD)').optional(),
  endDate:                z.string().date('Invalid end date (YYYY-MM-DD)').optional(),
}).superRefine((data, ctx) => {
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

export const loginSchema = z.object({
  email:    emailField,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  // Cookie is read directly — this schema validates the cookie name exists
});

export const resetPasswordInitSchema = z.object({
  email: emailField,
});

export const resetPasswordConfirmSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type RegisterInput          = z.infer<typeof registerSchema>;
export type LoginInput             = z.infer<typeof loginSchema>;
export type ResetPasswordInitInput = z.infer<typeof resetPasswordInitSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

import { z } from 'zod';

// Roles that may be picked at self-registration. `coordinator` and `admin`
// are intentionally excluded — those must be seeded or invited.
export const SELF_REGISTERABLE_ROLES = ['student', 'academic_supervisor', 'company_supervisor'] as const;

// Email normalization is the same everywhere: trim first so a paste-with-
// whitespace doesn't fail .email(), then lowercase so the DB row from
// registration always matches the lookup at login.
const emailField = z.string().trim().toLowerCase().pipe(z.string().email());

export const registerSchema = z.object({
  firstName:   z.string().trim().min(2).max(50),
  lastName:    z.string().trim().min(2).max(50),
  email:       emailField,
  password:    z.string().min(8, 'Password must be at least 8 characters').max(128),
  role:        z.enum(SELF_REGISTERABLE_ROLES),
  programmeId: z.string().uuid('Invalid programme ID').optional(),
}).refine(
  (data) => data.role !== 'student' || !!data.programmeId,
  { message: 'Students must select a programme', path: ['programmeId'] },
);

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

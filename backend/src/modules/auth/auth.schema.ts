import { z } from 'zod';
import { email as emailOf } from '../../shared/validation';

// registerSchema / updateProfileSchema are defined in shared/validation/auth so
// the SPA validates against the same objects; re-exported here so route wiring
// and imports elsewhere in the module are unchanged.
export {
  SELF_REGISTERABLE_ROLES,
  registerSchema,
  updateProfileSchema,
} from '../../shared/validation/auth';

const emailField = emailOf();

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

export type { RegisterInput, UpdateProfileInput } from '../../shared/validation/auth';
export type LoginInput             = z.infer<typeof loginSchema>;
export type ResetPasswordInitInput = z.infer<typeof resetPasswordInitSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

import { z } from 'zod';

// Every auth body shape is defined in shared/validation/auth so the SPA parses
// against the same objects; re-exported here so route wiring and imports
// elsewhere in the module are unchanged.
export {
  SELF_REGISTERABLE_ROLES,
  registerSchema,
  updateProfileSchema,
  loginSchema,
  resetPasswordInitSchema,
  resetPasswordConfirmSchema,
} from '../../shared/validation/auth';

export const refreshSchema = z.object({
  // Cookie is read directly — this schema validates the cookie name exists
});

export type {
  RegisterInput,
  UpdateProfileInput,
  LoginInput,
  ResetPasswordInitInput,
  ResetPasswordConfirmInput,
} from '../../shared/validation/auth';

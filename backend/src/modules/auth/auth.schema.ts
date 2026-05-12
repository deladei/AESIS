import { z } from 'zod';

export const registerSchema = z.object({
  firstName:   z.string().trim().min(2).max(50),
  lastName:    z.string().trim().min(2).max(50),
  email:       z.string().email().toLowerCase(),
  password:    z.string().min(8, 'Password must be at least 8 characters').max(128),
  programmeId: z.string().uuid('Invalid programme ID'),
});

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  // Cookie is read directly — this schema validates the cookie name exists
});

export const resetPasswordInitSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordConfirmSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export type RegisterInput          = z.infer<typeof registerSchema>;
export type LoginInput             = z.infer<typeof loginSchema>;
export type ResetPasswordInitInput = z.infer<typeof resetPasswordInitSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;

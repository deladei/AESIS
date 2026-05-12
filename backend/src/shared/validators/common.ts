import { z } from 'zod';

export const uuidParam = z.object({
  id: z.string().uuid('Invalid ID format'),
});

export const paginationQuery = z.object({
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const institutionalEmail = z
  .string()
  .email()
  .refine((e) => !e.includes('+'), 'Plus-addressing not permitted');

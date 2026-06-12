import { z } from 'zod';

// Define a learning objective for a placement.
export const defineObjectiveSchema = z.object({
  title:       z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

// Map an entry to one or more objectives (human-confirmed), or AI-suggest them.
export const entryObjectivesSchema = z.object({
  objectiveIds: z.array(z.string().uuid()).min(1).max(50),
});

export type DefineObjectiveInput = z.infer<typeof defineObjectiveSchema>;
export type EntryObjectivesInput = z.infer<typeof entryObjectivesSchema>;

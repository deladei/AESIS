import { z } from 'zod';

export const taskCategory = z.enum(['report', 'review', 'admin', 'meeting', 'other']);
export const taskStatus = z.enum(['open', 'in_progress', 'done', 'cancelled']);

export const createTaskSchema = z.object({
  title:       z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  category:    taskCategory.default('other'),
  dueAt:       z.string().datetime().optional(),
  // Minutes, so the student can say a task is a 30-minute job or a full day.
  // Capped at a 24-hour activity — anything longer is a project, not a to-do.
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  placementId: z.string().uuid().optional(),
  /**
   * Assigning to someone else is a staff action. A student may not set this —
   * the service forces the assignee to the caller for them, so a student can
   * never write a row onto another student's list.
   */
  assigneeId:  z.string().uuid().optional(),
});

export const updateTaskSchema = z.object({
  title:       z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category:    taskCategory.optional(),
  status:      taskStatus.optional(),
  dueAt:       z.string().datetime().nullable().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440).nullable().optional(),
});

/**
 * Setting one piece of work for several students at once.
 *
 * Separate from `createTaskSchema` rather than folded into it: this arrives as
 * multipart (it carries the brief), so every scalar is a string on the wire and
 * has to be coerced, and `assigneeIds` comes across as JSON. Overloading the
 * JSON endpoint with that would make both harder to read.
 */
export const assignWorkSchema = z.object({
  // 40 is the cap because it is a supervision list, not a mailing list; a
  // supervisor with more than that assigned is a data problem, not a use case.
  assigneeIds: z.array(z.string().uuid()).min(1, 'Choose at least one student').max(40),
  title:       z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  category:    taskCategory.default('other'),
  dueAt:       z.string().datetime().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
});

export type AssignWorkInput = z.infer<typeof assignWorkSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

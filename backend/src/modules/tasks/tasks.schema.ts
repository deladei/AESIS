import { z } from 'zod';

export const taskCategory = z.enum(['report', 'review', 'admin', 'meeting', 'other']);
export const taskStatus = z.enum(['open', 'in_progress', 'done', 'cancelled']);

export const createTaskSchema = z.object({
  title:       z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  category:    taskCategory.default('other'),
  dueAt:       z.string().datetime().optional(),
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
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

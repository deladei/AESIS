import { z } from 'zod';

export const resourceCategory = z.enum(['guideline', 'template', 'rubric', 'policy', 'form', 'sample', 'other']);
export const roleEnum = z.enum(['student', 'academic_supervisor', 'company_supervisor', 'coordinator', 'hod', 'admin']);

export const createResourceSchema = z.object({
  title:       z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  category:    resourceCategory.default('other'),
  externalUrl: z.string().url().max(2000).optional(),
  fileUrl:     z.string().url().max(2000).optional(),
  audienceRoles: z.array(roleEnum).min(1).default(['student']),
  sortOrder:   z.coerce.number().int().min(0).max(999).default(0),
  isPublished: z.boolean().default(true),
}).refine((v) => !!v.externalUrl || !!v.fileUrl, {
  message: 'A resource needs either a link or a file — an empty card helps nobody',
  path: ['externalUrl'],
});

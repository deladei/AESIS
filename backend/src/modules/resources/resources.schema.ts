import { z } from 'zod';

export const resourceCategory = z.enum([
  'announcement', 'guideline', 'template', 'rubric', 'policy', 'form', 'sample', 'other',
]);
export const roleEnum = z.enum(['student', 'academic_supervisor', 'company_supervisor', 'coordinator', 'hod', 'admin']);

// The fields a resource carries however it arrives. Multipart sends every value
// as a string, so the coercions here are what let one shape serve both the JSON
// route and the upload route rather than two drifting copies.
const resourceFields = {
  title:       z.string().trim().min(3).max(200),
  description: z.string().trim().max(1000).optional(),
  // Written guidance with no file behind it — the coordinator types the notice.
  body:        z.string().trim().max(20000).optional(),
  category:    resourceCategory.default('other'),
  externalUrl: z.string().url().max(2000).optional(),
  audienceRoles: z.array(roleEnum).min(1).default(['student']),
  sortOrder:   z.coerce.number().int().min(0).max(999).default(0),
  // Multipart sends strings, and `z.coerce.boolean()` reads the STRING "false"
  // as true — unticking "publish now" on an upload would have published it
  // anyway. Map the words a form actually sends, then coerce.
  isPublished: z.preprocess(
    (v) => (typeof v === 'string' ? !['false', '0', 'off', ''].includes(v.trim().toLowerCase()) : v),
    z.boolean().default(true),
  ),
};

export const createResourceSchema = z
  .object({ ...resourceFields, fileUrl: z.string().url().max(2000).optional() })
  .refine((v) => !!v.externalUrl || !!v.fileUrl || !!v.body, {
    message: 'A resource needs a link, a file, or something written — an empty card helps nobody',
    path: ['body'],
  });

/**
 * The multipart variant. The file itself arrives as the upload, so there is no
 * fileUrl to send and nothing to refine: an upload always has content.
 * `audienceRoles` comes over the wire as a repeated field or a JSON array
 * string, which is what the preprocess below normalises.
 */
export const uploadResourceSchema = z.object({
  ...resourceFields,
  audienceRoles: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (s.startsWith('[')) {
      try { return JSON.parse(s); } catch { return v; }
    }
    return s.split(',').map((r) => r.trim()).filter(Boolean);
  }, z.array(roleEnum).min(1).default(['student'])),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UploadResourceInput = z.infer<typeof uploadResourceSchema>;

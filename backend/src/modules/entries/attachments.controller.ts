import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { ok, created, noContent } from '../../shared/utils/response';
import {
  addAttachment,
  listAttachments,
  deleteAttachment,
  type IncomingFile,
} from './attachments.service';
import type { Actor } from './entries.policy';
import type { EntryRole } from './entry.stateMachine';

// Same accept-list and 10 MB cap as the legacy logbook attachment route, kept
// in sync deliberately — the university's allowed evidence formats are PDF,
// image, and Word documents. Buffers stay in memory; the service streams them
// straight to Cloudinary, so nothing touches local disk.
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Only PDF, PNG, JPG, and DOCX files are accepted'));
  },
});

// Router mounts this at /entries/:id/attachments with mergeParams, so the entry
// id arrives as the parent `:id`.
const entryIdParam = z.object({ id: z.string().uuid() });
const attachmentIdParam = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() });
// Optional multipart text field: the working day this file evidences
// (YYYY-MM-DD). The service validates it against the entry's period.
const uploadBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

function actorOf(req: Request): Actor {
  return { id: req.user!.sub, role: req.user!.role as EntryRole };
}

export async function listAttachmentsHandler(req: Request, res: Response) {
  const { id } = entryIdParam.parse(req.params);
  const attachments = await listAttachments(actorOf(req), id);
  return ok(res, attachments);
}

export async function addAttachmentHandler(req: Request, res: Response) {
  const { id } = entryIdParam.parse(req.params);

  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError(400, 'No file uploaded');
  const { date } = uploadBody.parse(req.body ?? {});

  const incoming: IncomingFile = {
    buffer: file.buffer,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  };
  const attachment = await addAttachment(actorOf(req), id, incoming, date);
  return created(res, attachment);
}

export async function deleteAttachmentHandler(req: Request, res: Response) {
  const { id, attachmentId } = attachmentIdParam.parse(req.params);
  await deleteAttachment(actorOf(req), id, attachmentId);
  return noContent(res);
}

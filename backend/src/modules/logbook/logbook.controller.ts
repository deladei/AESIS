import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { ok, created } from '../../shared/utils/response';
import { uuidParam, paginationQuery } from '../../shared/validators/common';
import {
  saveDraftSchema,
  feedbackSchema,
  weekParamSchema,
} from './logbook.schema';
import * as service from './logbook.service';

// ── File upload config ────────────────────────────────────────

const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Only PDF, PNG, JPG, and DOCX files are accepted'));
  },
});

const placementIdParam = z.object({ placementId: z.string().uuid() });
const submissionIdParam = z.object({ submissionId: z.string().uuid() });

// ── Handlers ──────────────────────────────────────────────────

export async function getDraftHandler(req: Request, res: Response) {
  const { placementId } = placementIdParam.parse(req.params);
  const { weekNumber }  = weekParamSchema.parse({ weekNumber: req.query['weekNumber'] });

  const submission = await service.getOrCreateDraft(req.user!.sub, placementId, weekNumber);
  return ok(res, submission);
}

export async function saveDraftHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);
  const input = saveDraftSchema.parse(req.body);

  const submission = await service.saveDraft(submissionId, req.user!.sub, input);
  return ok(res, submission);
}

export async function submitLogbookHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);

  const submission = await service.submitLogbook(submissionId, req.user!.sub);
  return ok(res, submission);
}

export async function getSubmissionHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);

  const submission = await service.getSubmission(submissionId, req.user!.sub, req.user!.role);
  return ok(res, submission);
}

export async function listSubmissionsHandler(req: Request, res: Response) {
  const { placementId } = placementIdParam.parse(req.params);
  const { page, limit } = paginationQuery.parse(req.query);

  const result = await service.listSubmissions(placementId, req.user!.sub, req.user!.role, page, limit);
  return ok(res, result.submissions, result.meta);
}

export async function addAttachmentHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);

  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError(400, 'No file uploaded');

  // Phase 9: replace with real S3/Cloudinary upload; placeholder URL for now
  const fileUrl = (file as Express.Multer.File & { location?: string }).location
    ?? `local://${submissionId}/${Date.now()}_${file.originalname}`;

  const attachment = await service.addAttachment(submissionId, req.user!.sub, {
    url:      fileUrl,
    name:     file.originalname,
    size:     file.size,
    mimeType: file.mimetype,
  });
  return created(res, attachment);
}

export async function listAttachmentsHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);

  const attachments = await service.listAttachments(submissionId, req.user!.sub, req.user!.role);
  return ok(res, attachments);
}

export async function submitFeedbackHandler(req: Request, res: Response) {
  const { submissionId } = submissionIdParam.parse(req.params);
  const input = feedbackSchema.parse(req.body);

  const feedback = await service.submitFeedback(submissionId, req.user!.sub, input);
  return created(res, feedback);
}

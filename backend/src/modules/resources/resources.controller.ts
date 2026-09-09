import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { ok, created } from '../../shared/utils/response';
import { createResourceSchema, uploadResourceSchema } from './resources.schema';
import * as service from './resources.service';

// Same accept-list and 10 MB cap as logbook evidence — one answer app-wide to
// "what may be uploaded here". Buffers stay in memory; the service streams them
// to Cloudinary, so nothing touches local disk.
const ALLOWED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const resourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
    cb(new AppError(415, 'Only PDF, PNG, JPG, and DOCX files are accepted'));
  },
});

const idParam = z.object({ id: z.string().uuid() });
const publishBody = z.object({ isPublished: z.boolean() });
const actorOf = (req: Request) => ({ id: req.user!.sub, role: req.user!.role });

export async function listHandler(req: Request, res: Response) {
  ok(res, await service.listResources(actorOf(req)));
}

export async function listManagedHandler(_req: Request, res: Response) {
  ok(res, await service.listManagedResources());
}

export async function createHandler(req: Request, res: Response) {
  created(res, await service.createResource(actorOf(req), createResourceSchema.parse(req.body)));
}

export async function uploadHandler(req: Request, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw new AppError(400, 'No file uploaded');
  const input = uploadResourceSchema.parse(req.body ?? {});
  created(res, await service.uploadResource(actorOf(req), input, {
    buffer: file.buffer,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype,
  }));
}

export async function publishHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  const { isPublished } = publishBody.parse(req.body ?? {});
  ok(res, await service.setResourcePublished(actorOf(req), id, isPublished));
}

export async function archiveHandler(req: Request, res: Response) {
  const { id } = idParam.parse(req.params);
  ok(res, await service.archiveResource(actorOf(req), id));
}

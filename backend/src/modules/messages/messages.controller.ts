import { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../../shared/utils/response';
import * as messages from './messages.service';
import { isCloudinaryConfigured, uploadBuffer } from '../../config/cloudinary';
import { AppError } from '../../middleware/errorHandler';

const placementParam = z.object({ placementId: z.string().uuid() });
// Empty is allowed here: the service refuses a message that has neither text
// nor an attachment, which is the rule that actually matters.
const postBody = z.object({ body: z.string().trim().max(4000).default('') });

function actorOf(req: Request): messages.Actor {
  return { id: req.user!.sub, role: req.user!.role };
}

export async function listThreadHandler(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const thread = await messages.listThread(actorOf(req), placementId);
  return ok(res, { messages: thread });
}

/**
 * Post a message, optionally with files.
 *
 * The route is multipart so text and attachments arrive together — a caption
 * and its screenshot are one message, not two. `body` is optional here because
 * the service already decides that a message needs either text or a file.
 */
export async function postMessageHandler(req: Request, res: Response) {
  const { placementId } = placementParam.parse(req.params);
  const { body } = postBody.parse({ body: req.body?.body ?? '' });

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length > 0 && !isCloudinaryConfigured()) {
    throw new AppError(503, 'File storage is not configured on this environment');
  }

  const attachments = await Promise.all(files.map(async (file) => {
    const isImage = file.mimetype.startsWith('image/');
    const uploaded = await uploadBuffer(file.buffer, {
      folder: `aesis/messages/${placementId}`,
      isImage,
    });
    return {
      fileUrl:  uploaded.url,
      publicId: uploaded.publicId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      kind:     (isImage ? 'image' : 'document') as 'image' | 'document',
    };
  }));

  const message = await messages.postMessage(actorOf(req), placementId, body, attachments);
  return created(res, { message });
}

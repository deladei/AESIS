import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from './env';
import { logger } from './logger';

// Cloudinary is the object store for logbook entry attachments. Credentials are
// optional in env (dev/test boot without them); callers must gate writes on
// isCloudinaryConfigured() and surface a 503 when it's false — we never silently
// fall back to a fake/placeholder URL like the legacy logbook route did.

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
  );
}

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export interface UploadedAsset {
  url: string; // secure_url
  publicId: string; // public_id (handle used for deletion)
  bytes: number;
}

/**
 * Upload a file buffer (from multer memoryStorage) to Cloudinary under the
 * AESIS entry-attachments folder. `resourceType: 'auto'` lets Cloudinary store
 * images as images and PDFs/DOCX as raw files. Returns the secure URL +
 * public_id to persist on the EntryAttachment row.
 */
export function uploadBuffer(
  buffer: Buffer,
  opts: { folder: string; isImage: boolean },
): Promise<UploadedAsset> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        // Images go through Cloudinary's image pipeline; documents are stored raw.
        resource_type: opts.isImage ? 'image' : 'raw',
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          logger.error('Cloudinary upload failed', { err: error });
          return reject(error ?? new Error('Cloudinary upload returned no result'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id, bytes: result.bytes });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Delete a previously uploaded asset by its public_id. Best-effort: a failure
 * is logged but not thrown, so a DB-row delete is never blocked by a remote
 * hiccup (the row is the system of record; an orphaned remote file is harmless).
 */
export async function deleteAsset(publicId: string, isImage: boolean): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: isImage ? 'image' : 'raw',
    });
  } catch (err) {
    logger.error('Cloudinary delete failed (orphaned remote asset)', { err, publicId });
  }
}

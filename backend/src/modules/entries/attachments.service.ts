import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { isCloudinaryConfigured, uploadBuffer, deleteAsset } from '../../config/cloudinary';
import { isEditable, type EntryStatus } from './entry.stateMachine';
import { assertPlacementAccess, type Actor } from './entries.policy';

// Image/document evidence attached to a weekly entry. Write rules mirror the
// entry edit rules: only on an editable (draft/returned) entry, and only by an
// actor with `write` access to the placement (the owning student, or admin).
// Reads follow `read` access (student/own + assigned supervisors + coordinator).

const MAX_ATTACHMENTS_PER_ENTRY = 10;

export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  size: number;
  mimeType: string;
}

function kindOf(mimeType: string): 'image' | 'document' {
  return mimeType.startsWith('image/') ? 'image' : 'document';
}

// Load the entry's status + placement-ownership fields needed for authz.
async function loadEntryForAttachment(entryId: string) {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      status: true,
      placement: {
        select: {
          id: true,
          studentId: true,
          academicSupervisorId: true,
          companySupervisorId: true,
        },
      },
    },
  });
  if (!entry) throw new AppError(404, 'Logbook entry not found');
  return entry;
}

export async function listAttachments(actor: Actor, entryId: string) {
  const entry = await loadEntryForAttachment(entryId);
  assertPlacementAccess(actor, entry.placement, 'read');

  return prisma.entryAttachment.findMany({
    where: { entryId },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      kind: true,
      uploadedAt: true,
    },
  });
}

export async function addAttachment(actor: Actor, entryId: string, file: IncomingFile) {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'File storage is not configured; uploads are unavailable');
  }

  const entry = await loadEntryForAttachment(entryId);
  // `write` access: only the owning student (or admin) — supervisors/coordinator
  // get 403 here, never authoring entry evidence.
  assertPlacementAccess(actor, entry.placement, 'write');

  if (!isEditable(entry.status as EntryStatus)) {
    throw new AppError(
      409,
      'Attachments can only be added while the week is a draft or has been returned',
    );
  }

  const count = await prisma.entryAttachment.count({ where: { entryId } });
  if (count >= MAX_ATTACHMENTS_PER_ENTRY) {
    throw new AppError(422, `A week can have at most ${MAX_ATTACHMENTS_PER_ENTRY} attachments`);
  }

  const kind = kindOf(file.mimeType);
  const asset = await uploadBuffer(file.buffer, {
    folder: `aesis/entries/${entryId}`,
    isImage: kind === 'image',
  });

  return prisma.entryAttachment.create({
    data: {
      entryId,
      fileUrl: asset.url,
      publicId: asset.publicId,
      fileName: file.originalName,
      fileSize: file.size,
      mimeType: file.mimeType,
      kind,
      uploadedById: actor.id,
    },
    select: {
      id: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      kind: true,
      uploadedAt: true,
    },
  });
}

export async function deleteAttachment(actor: Actor, entryId: string, attachmentId: string) {
  const entry = await loadEntryForAttachment(entryId);
  assertPlacementAccess(actor, entry.placement, 'write');

  if (!isEditable(entry.status as EntryStatus)) {
    throw new AppError(
      409,
      'Attachments can only be removed while the week is a draft or has been returned',
    );
  }

  const attachment = await prisma.entryAttachment.findFirst({
    where: { id: attachmentId, entryId },
    select: { id: true, publicId: true, kind: true },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');

  // Remote delete is best-effort (logged, not thrown); the row is the record of
  // truth, so we always remove it.
  await deleteAsset(attachment.publicId, attachment.kind === 'image');
  await prisma.entryAttachment.delete({ where: { id: attachment.id } });
}

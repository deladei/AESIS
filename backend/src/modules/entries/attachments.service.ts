import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { isCloudinaryConfigured, uploadBuffer, deleteAsset } from '../../config/cloudinary';
import { isEditable, type EntryStatus } from './entry.stateMachine';
import { parseDateOnly, isFuture } from './entry.dates';
import { assertPlacementAccess, type Actor } from './entries.policy';

// Image/document evidence, scoped to one working DAY of a weekly entry (like
// attaching a file to one email — each day's log carries its own files).
// Write rules mirror the day edit rules: the day must still be editable (not
// submitted, unless the week was returned; week not acknowledged), and only an
// actor with `write` access to the placement (the owning student, or admin).
// Reads follow `read` access (student/own + assigned supervisors + coordinator).
// Rows with a null dayDate predate day scoping and are week-level evidence.

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

// Load the entry's status + period + placement-ownership fields needed for authz.
async function loadEntryForAttachment(entryId: string) {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      status: true,
      periodStart: true,
      periodEnd: true,
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

/**
 * Day-level write gate, mirroring the day edit rules: the week must not be
 * acknowledged, and a submitted day is locked unless the week was returned.
 * A null day (legacy week-level file) falls back to the week edit gate.
 */
async function assertDayWritable(
  entry: { id: string; status: string },
  dayDate: Date | null,
): Promise<void> {
  if (entry.status === 'acknowledged') {
    throw new AppError(409, 'This week has been acknowledged and is locked');
  }
  if (!dayDate) {
    if (!isEditable(entry.status as EntryStatus)) {
      throw new AppError(
        409,
        'Attachments can only be changed while the week is a draft or has been returned',
      );
    }
    return;
  }
  const day = await prisma.dailyEntry.findFirst({
    where: { entryId: entry.id, workDate: dayDate },
    select: { status: true },
  });
  if (day?.status === 'submitted' && entry.status !== 'returned') {
    throw new AppError(409, 'This day is already submitted; its attachments are locked');
  }
}

export async function listAttachments(actor: Actor, entryId: string) {
  const entry = await loadEntryForAttachment(entryId);
  assertPlacementAccess(actor, entry.placement, 'read');

  return prisma.entryAttachment.findMany({
    where: { entryId },
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      dayDate: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      kind: true,
      uploadedAt: true,
    },
  });
}

export async function addAttachment(
  actor: Actor,
  entryId: string,
  file: IncomingFile,
  dayDateStr?: string,
) {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, 'File storage is not configured; uploads are unavailable');
  }

  const entry = await loadEntryForAttachment(entryId);
  // `write` access: only the owning student (or admin) — supervisors/coordinator
  // get 403 here, never authoring entry evidence.
  assertPlacementAccess(actor, entry.placement, 'write');

  // The file evidences one working day; the day must be valid for this week
  // and follow the same anti-cheat window as logging it (never in the future).
  let dayDate: Date | null = null;
  if (dayDateStr) {
    dayDate = parseDateOnly(dayDateStr, 'date');
    if (
      dayDate.getTime() < entry.periodStart.getTime() ||
      dayDate.getTime() > entry.periodEnd.getTime()
    ) {
      throw new AppError(422, 'That day is outside this week');
    }
    if (isFuture(dayDate)) {
      throw new AppError(422, 'You cannot attach files to a day in the future');
    }
  }
  await assertDayWritable(entry, dayDate);

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
      dayDate,
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
      dayDate: true,
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

  const attachment = await prisma.entryAttachment.findFirst({
    where: { id: attachmentId, entryId },
    select: { id: true, publicId: true, kind: true, dayDate: true },
  });
  if (!attachment) throw new AppError(404, 'Attachment not found');

  // Same gate as adding: the file's day must still be editable.
  await assertDayWritable(entry, attachment.dayDate);

  // Remote delete is best-effort (logged, not thrown); the row is the record of
  // truth, so we always remove it.
  await deleteAsset(attachment.publicId, attachment.kind === 'image');
  await prisma.entryAttachment.delete({ where: { id: attachment.id } });
}

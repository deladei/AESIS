import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { uploadBuffer } from '../../config/cloudinary';
import type { CreateResourceInput, UploadResourceInput } from './resources.schema';
import type { UserRole } from '@prisma/client';

export interface Actor { id: string; role: string }

const SELECT = {
  id: true, title: true, description: true, body: true, category: true,
  fileUrl: true, externalUrl: true, mimeType: true, fileSize: true,
  sortOrder: true, isPublished: true, createdAt: true,
} as const;

// What the curator sees on top of the reader's view: who it is for and whether
// it is live. A shelf you publish to somebody else is invisible on your own
// shelf, so the manage list has to say who each card reaches.
const MANAGE_SELECT = { ...SELECT, audienceRoles: true, updatedAt: true } as const;

// Files land in one Cloudinary folder so the shelf's assets are separable from
// student evidence, which has a different retention story.
const RESOURCE_FOLDER = 'aesis/resources';

/**
 * What this caller may see. Audience is a list of roles on the row, so a rubric
 * meant for supervisors never shows up on a student's shelf.
 */
export async function listResources(actor: Actor) {
  return prisma.resource.findMany({
    where: {
      isPublished: true,
      archivedAt: null,
      audienceRoles: { has: actor.role as UserRole },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: SELECT,
  });
}

/**
 * The curator's view: every live resource, whoever it is aimed at and whether
 * or not it is published. `listResources` filters to the reader's own role, so
 * without this an admin publishing to students could not see — or withdraw —
 * what they had just posted.
 */
export async function listManagedResources() {
  return prisma.resource.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: MANAGE_SELECT,
  });
}

export async function createResource(actor: Actor, input: CreateResourceInput) {
  return prisma.resource.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      body: input.body ?? null,
      category: input.category,
      externalUrl: input.externalUrl ?? null,
      fileUrl: input.fileUrl ?? null,
      audienceRoles: input.audienceRoles as UserRole[],
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      createdById: actor.id,
    },
    select: MANAGE_SELECT,
  });
}

export interface IncomingFile {
  buffer: Buffer;
  originalName: string;
  size: number;
  mimeType: string;
}

/**
 * Publish a document to the shelf. The upload happens BEFORE the row is
 * written, so a failed upload leaves no card pointing at nothing — the reverse
 * order would put a broken tile on every reader's dashboard.
 */
export async function uploadResource(actor: Actor, input: UploadResourceInput, file: IncomingFile) {
  const asset = await uploadBuffer(file.buffer, {
    folder: RESOURCE_FOLDER,
    isImage: file.mimeType.startsWith('image/'),
  });

  return prisma.resource.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      body: input.body ?? null,
      category: input.category,
      externalUrl: input.externalUrl ?? null,
      fileUrl: asset.url,
      filePublicId: asset.publicId,
      mimeType: file.mimeType,
      fileSize: file.size,
      audienceRoles: input.audienceRoles as UserRole[],
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      createdById: actor.id,
    },
    select: MANAGE_SELECT,
  });
}

export async function archiveResource(_actor: Actor, id: string) {
  const existing = await prisma.resource.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError(404, 'Resource not found');
  // Archived, not deleted — a template someone linked to should stop being
  // offered without the link breaking silently. The Cloudinary asset stays for
  // the same reason.
  return prisma.resource.update({
    where: { id },
    data: { archivedAt: new Date(), isPublished: false },
    select: MANAGE_SELECT,
  });
}

/** Take a card off the shelf, or put it back, without archiving it. */
export async function setResourcePublished(_actor: Actor, id: string, isPublished: boolean) {
  const existing = await prisma.resource.findUnique({
    where: { id },
    select: { id: true, archivedAt: true },
  });
  if (!existing) throw new AppError(404, 'Resource not found');
  if (existing.archivedAt) throw new AppError(409, 'This resource is archived');
  return prisma.resource.update({ where: { id }, data: { isPublished }, select: MANAGE_SELECT });
}

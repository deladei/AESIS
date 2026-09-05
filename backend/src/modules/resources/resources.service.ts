import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { z } from 'zod';
import type { createResourceSchema } from './resources.schema';
import type { UserRole } from '@prisma/client';

export interface Actor { id: string; role: string }

const SELECT = {
  id: true, title: true, description: true, category: true,
  fileUrl: true, externalUrl: true, mimeType: true, fileSize: true,
  sortOrder: true, isPublished: true, createdAt: true,
} as const;

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

export async function createResource(actor: Actor, input: z.infer<typeof createResourceSchema>) {
  return prisma.resource.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      externalUrl: input.externalUrl ?? null,
      fileUrl: input.fileUrl ?? null,
      audienceRoles: input.audienceRoles as UserRole[],
      sortOrder: input.sortOrder,
      isPublished: input.isPublished,
      createdById: actor.id,
    },
    select: SELECT,
  });
}

export async function archiveResource(actor: Actor, id: string) {
  const existing = await prisma.resource.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError(404, 'Resource not found');
  // Archived, not deleted — a template someone linked to should stop being
  // offered without the link breaking silently.
  return prisma.resource.update({
    where: { id },
    data: { archivedAt: new Date(), isPublished: false },
    select: SELECT,
  });
}

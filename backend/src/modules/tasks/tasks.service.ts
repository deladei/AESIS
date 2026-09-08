import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';
import { deleteAsset, isCloudinaryConfigured, uploadBuffer } from '../../config/cloudinary';
import type { AssignWorkInput, CreateTaskInput, UpdateTaskInput } from './tasks.schema';

export interface Actor { id: string; role: string }

const STAFF = ['academic_supervisor', 'coordinator', 'hod', 'admin'];

/**
 * May `actor` put a task on `studentId`'s list?
 *
 * A student may only ever write to their own. A supervisor may write to a
 * student they are actually assigned to — resolved from the placement table,
 * never from anything the client sent. Coordinators and admins are cohort-wide.
 */
async function assertMayAssign(actor: Actor, assigneeId: string): Promise<void> {
  if (assigneeId === actor.id) return;
  if (actor.role === 'admin' || actor.role === 'coordinator' || actor.role === 'hod') return;

  if (actor.role === 'academic_supervisor') {
    const supervised = await prisma.placement.findFirst({
      where: { studentId: assigneeId, academicSupervisorId: actor.id, isCurrent: true },
      select: { id: true },
    });
    if (supervised) return;
    throw new AppError(403, 'You do not supervise this student');
  }
  throw new AppError(403, 'You cannot assign a task to another user');
}

export async function listTasks(actor: Actor, opts: { placementId?: string; assigneeId?: string } = {}) {
  // Staff may look at one student's list; everyone else sees only their own.
  let assigneeId = actor.id;
  if (opts.assigneeId && opts.assigneeId !== actor.id) {
    if (!STAFF.includes(actor.role)) throw new AppError(403, 'Access denied');
    await assertMayAssign(actor, opts.assigneeId);
    assigneeId = opts.assigneeId;
  }

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId,
      status: { not: 'cancelled' },
      ...(opts.placementId ? { placementId: opts.placementId } : {}),
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, description: true, category: true, status: true,
      dueAt: true, durationMinutes: true, completedAt: true, sourceType: true, sourceId: true, createdAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      // Without these the brief a supervisor attached is invisible to the
      // student the work was set for, which is the whole point of setting it.
      attachments: {
        select: { id: true, fileUrl: true, fileName: true, fileSize: true, mimeType: true, kind: true },
        orderBy: { uploadedAt: 'asc' },
      },
    },
  });

  // "18 / 28" is counted here, never stored. Cancelled rows are excluded from
  // both halves so withdrawing a task cannot make progress look worse.
  const done = tasks.filter((t) => t.status === 'done').length;
  return { tasks, progress: { done, total: tasks.length } };
}

export async function createTask(actor: Actor, input: CreateTaskInput) {
  const assigneeId = STAFF.includes(actor.role) && input.assigneeId ? input.assigneeId : actor.id;
  await assertMayAssign(actor, assigneeId);

  // A task pinned to a placement must be pinned to the assignee's own.
  if (input.placementId) {
    const p = await prisma.placement.findUnique({
      where: { id: input.placementId },
      select: { studentId: true },
    });
    if (!p) throw new AppError(404, 'Placement not found');
    if (p.studentId !== assigneeId) {
      throw new AppError(422, "That placement does not belong to the task's assignee");
    }
  }

  return prisma.task.create({
    data: {
      assigneeId,
      createdById: actor.id,
      placementId: input.placementId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      durationMinutes: input.durationMinutes ?? null,
    },
  });
}

export async function updateTask(actor: Actor, id: string, input: UpdateTaskInput) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError(404, 'Task not found');

  const isAssignee = task.assigneeId === actor.id;
  const isCreator = task.createdById === actor.id;
  const isAdmin = actor.role === 'admin';
  if (!isAssignee && !isCreator && !isAdmin) throw new AppError(403, 'Access denied');

  // The assignee owns the tick-box and nothing else: they may move their own
  // task's status, but not rewrite a task somebody assigned to them.
  const contentKeys = ['title', 'description', 'category', 'dueAt', 'durationMinutes'] as const;
  const editsContent = contentKeys.some((k) => input[k] !== undefined);
  if (editsContent && !isCreator && !isAdmin) {
    throw new AppError(403, 'Only whoever created this task can change its content');
  }

  const completing = input.status === 'done' && task.status !== 'done';
  const reopening = input.status && input.status !== 'done' && task.status === 'done';

  return prisma.task.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt ? new Date(input.dueAt) : null }),
      ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
      ...(completing && { completedAt: new Date() }),
      ...(reopening && { completedAt: null }),
    },
  });
}

export async function deleteTask(actor: Actor, id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError(404, 'Task not found');
  if (task.createdById !== actor.id && actor.role !== 'admin') {
    throw new AppError(403, 'Only whoever created this task can remove it');
  }
  // Cancelled, not deleted — an assigned task disappearing without trace is
  // indistinguishable from one that was never assigned.
  return prisma.task.update({ where: { id }, data: { status: 'cancelled' } });
}

// ── Setting work for several students at once ─────────────────

interface IncomingFile {
  originalname: string;
  mimetype:     string;
  size:         number;
  buffer:       Buffer;
}

/**
 * Set one piece of work for a group of supervised students.
 *
 * Every assignee is checked with the SAME `assertMayAssign` a single task uses,
 * so a supervisor still cannot reach a student they do not supervise — and the
 * check runs for ALL of them before anything is written, so a list with one bad
 * id creates nothing rather than a partial batch the caller has to reconcile.
 *
 * The files are uploaded ONCE and every task points at the same asset. Sending
 * the same PDF to fifteen students should cost one upload, not fifteen.
 */
export async function assignWork(actor: Actor, input: AssignWorkInput, files: IncomingFile[] = []) {
  if (!STAFF.includes(actor.role)) {
    throw new AppError(403, 'Only staff can set work for a student');
  }

  // Deduplicated: the same student twice in the list is a UI slip, not a
  // request for two identical tasks.
  const assigneeIds = [...new Set(input.assigneeIds)];
  for (const id of assigneeIds) await assertMayAssign(actor, id);

  if (files.length && !isCloudinaryConfigured()) {
    throw new AppError(503, 'File storage is not configured on this server');
  }

  // Uploaded before the transaction: a network call has no place inside one,
  // and an orphaned asset is a far smaller problem than a lock held open on
  // every task row while an upload runs.
  const uploaded = await Promise.all(files.map(async (f) => {
    const isImage = f.mimetype.startsWith('image/');
    // A storage failure is the upload's fault, not the server's — a corrupt or
    // unreadable file should not surface as a bare 500.
    const asset = await uploadBuffer(f.buffer, {
      folder: 'aesis/task-attachments',
      isImage,
    }).catch(() => {
      throw new AppError(400, `Could not store "${f.originalname}" — is the file valid?`);
    });
    return {
      fileUrl:  asset.url,
      publicId: asset.publicId,
      fileName: f.originalname,
      fileSize: f.size,
      mimeType: f.mimetype,
      kind:     (isImage ? 'image' : 'document') as 'image' | 'document',
      uploadedById: actor.id,
    };
  }));

  try {
    return await prisma.$transaction(async (tx) => {
      // Pin each task to the student's current placement where they have one,
      // so the work shows up against the right attachment rather than floating.
      const placements = await tx.placement.findMany({
        where:  { studentId: { in: assigneeIds }, isCurrent: true },
        select: { id: true, studentId: true },
      });
      const placementByStudent = new Map(placements.map((p) => [p.studentId, p.id]));

      const created = [];
      for (const assigneeId of assigneeIds) {
        const task = await tx.task.create({
          data: {
            assigneeId,
            createdById:     actor.id,
            placementId:     placementByStudent.get(assigneeId) ?? null,
            title:           input.title,
            description:     input.description ?? null,
            category:        input.category,
            dueAt:           input.dueAt ? new Date(input.dueAt) : null,
            durationMinutes: input.durationMinutes ?? null,
            // Same asset on every row — see the model comment on why deletion
            // has to count rows before removing anything remotely.
            ...(uploaded.length && { attachments: { create: uploaded } }),
          },
          select: { id: true, assigneeId: true },
        });
        created.push(task);
      }
      return { created: created.length, tasks: created };
    });
  } catch (err) {
    // The tasks did not land, so nothing references these assets. Leaving them
    // behind would be a slow storage leak nobody ever looks for.
    await Promise.all(uploaded.map((u) =>
      deleteAsset(u.publicId, u.kind === 'image').catch(() => { /* best effort */ })));
    throw err;
  }
}

/**
 * Remove one attachment from one task.
 *
 * The remote asset is deleted only when this was the LAST row holding it.
 * Assigning to a group shares one upload across every task, so deleting
 * eagerly would blank the brief for every other student in the batch.
 */
export async function removeTaskAttachment(actor: Actor, taskId: string, attachmentId: string) {
  const attachment = await prisma.taskAttachment.findUnique({
    where:  { id: attachmentId },
    select: { id: true, taskId: true, publicId: true, kind: true, task: { select: { createdById: true } } },
  });
  if (!attachment || attachment.taskId !== taskId) throw new AppError(404, 'Attachment not found');

  if (attachment.task.createdById !== actor.id && actor.role !== 'admin') {
    throw new AppError(403, 'Only whoever set this work can remove its attachment');
  }

  await prisma.taskAttachment.delete({ where: { id: attachment.id } });

  const stillUsed = await prisma.taskAttachment.count({ where: { publicId: attachment.publicId } });
  if (stillUsed === 0) {
    await deleteAsset(attachment.publicId, attachment.kind === 'image')
      .catch((err) => logger.warn('Task attachment asset not removed', {
        publicId: attachment.publicId, message: (err as Error).message,
      }));
  }

  return { removed: true, assetDeleted: stillUsed === 0 };
}

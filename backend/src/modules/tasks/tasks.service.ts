import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { CreateTaskInput, UpdateTaskInput } from './tasks.schema';

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
      dueAt: true, completedAt: true, sourceType: true, sourceId: true, createdAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
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
  const contentKeys = ['title', 'description', 'category', 'dueAt'] as const;
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

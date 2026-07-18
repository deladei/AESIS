import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { createNotification } from '../notifications/notifications.service';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { sendEmail } from '../../shared/utils/email';

export interface Actor {
  id: string;
  role: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Thread participants: the student, their academic supervisor, and any admin.
// A coordinator may read for oversight but not post. The check is the single
// place authorization for a placement's message thread is decided.
async function loadThreadPlacement(placementId: string) {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: {
      id: true,
      studentId: true,
      academicSupervisorId: true,
      student: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
  if (!placement) throw new AppError(404, 'Placement not found');
  return placement;
}

function canRead(actor: Actor, p: { studentId: string; academicSupervisorId: string | null }): boolean {
  return (
    actor.role === 'admin' ||
    actor.role === 'coordinator' ||
    actor.role === 'hod' ||
    actor.id === p.studentId ||
    actor.id === p.academicSupervisorId
  );
}

function canPost(actor: Actor, p: { studentId: string; academicSupervisorId: string | null }): boolean {
  // Coordinators and the HoD are read-only oversight; everyone else who can read can post.
  return actor.role !== 'coordinator' && actor.role !== 'hod' && canRead(actor, p);
}

export async function listThread(actor: Actor, placementId: string) {
  const placement = await loadThreadPlacement(placementId);
  if (!canRead(actor, placement)) {
    throw new AppError(403, 'You do not have access to this conversation');
  }

  const messages = await prisma.message.findMany({
    where: { placementId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      body: true,
      createdAt: true,
      readAt: true,
      senderId: true,
      sender: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  // Mark messages the actor received (not their own) as read.
  const unreadIncoming = messages.filter(m => m.senderId !== actor.id && m.readAt == null);
  if (unreadIncoming.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadIncoming.map(m => m.id) } },
      data: { readAt: new Date() },
    });
  }

  return messages.map(m => ({
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    senderId: m.senderId,
    senderName: `${m.sender.firstName} ${m.sender.lastName}`.trim(),
    senderRole: m.sender.role,
    mine: m.senderId === actor.id,
  }));
}

export async function postMessage(actor: Actor, placementId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new AppError(400, 'Message cannot be empty');
  if (trimmed.length > 4000) throw new AppError(400, 'Message is too long (max 4000 characters)');

  const placement = await loadThreadPlacement(placementId);
  if (!canPost(actor, placement)) {
    throw new AppError(403, 'You cannot post to this conversation');
  }

  const created = await prisma.message.create({
    data: { placementId, senderId: actor.id, body: trimmed },
    select: {
      id: true,
      body: true,
      createdAt: true,
      senderId: true,
      sender: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  const senderName = `${created.sender.firstName} ${created.sender.lastName}`.trim();

  // Fan-out: the student + the academic supervisor are always counterparts;
  // additionally notify any admin who has already posted in this thread (so a
  // student's reply reaches the admin who started it, without spamming every
  // admin). Exclude the sender.
  const priorSenders = await prisma.message.findMany({
    where: { placementId, NOT: { senderId: actor.id } },
    distinct: ['senderId'],
    select: { senderId: true },
  });
  const recipientIds = new Set<string>(priorSenders.map(s => s.senderId));
  recipientIds.add(placement.studentId);
  if (placement.academicSupervisorId) recipientIds.add(placement.academicSupervisorId);
  recipientIds.delete(actor.id);

  const snippet = trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
  for (const userId of recipientIds) {
    await createNotification({
      userId,
      type: 'system',
      title: `New message from ${senderName}`,
      body: snippet,
      link: '/feedback',
      metadata: { kind: 'message', placementId, senderName },
    });
    emitToUser(userId, 'notification:new', { kind: 'message', placementId });
  }

  // Email the student when they're a recipient — they're the participant most
  // likely to be off-platform. Best-effort; the in-app notification is the record.
  if (recipientIds.has(placement.studentId)) {
    await sendEmail({
      to: placement.student.email,
      subject: `AESIS — New message from ${senderName}`,
      html:
        `<p>Hi ${escapeHtml(placement.student.firstName)},</p>` +
        `<p>${escapeHtml(senderName)} sent you a message:</p>` +
        `<blockquote>${escapeHtml(trimmed)}</blockquote>` +
        `<p>Sign in to AESIS and open the Feedback Center to reply.</p>`,
    }).catch(() => { /* best-effort */ });
  }

  return {
    id: created.id,
    body: created.body,
    createdAt: created.createdAt,
    senderId: created.senderId,
    senderName,
    senderRole: created.sender.role,
    mine: true,
  };
}

import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { Prisma, type NotificationType } from '@prisma/client';

export interface NotificationFilters {
  unreadOnly?: boolean;
  type?:       NotificationType;
  page?:       number;
  limit?:      number;
}

// ── List ──────────────────────────────────────────────────────

export async function listNotifications(userId: string, filters: NotificationFilters = {}) {
  const { page = 1, limit = 20, unreadOnly, type } = filters;
  const { skip, take } = paginate(page, limit);

  const where = {
    userId,
    ...(unreadOnly ? { isRead: false } : {}),
    ...(type       ? { type }          : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true, type: true, title: true, body: true,
        isRead: true, link: true, metadata: true, createdAt: true, readAt: true,
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return { notifications, meta: buildMeta(total, page, limit) };
}

// ── Unread count ──────────────────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

// ── Mark one read ─────────────────────────────────────────────

export async function markRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification) throw new AppError(404, 'Notification not found');
  if (notification.userId !== userId) throw new AppError(403, 'Forbidden');
  if (notification.isRead) return notification;  // idempotent

  return prisma.notification.update({
    where: { id: notificationId },
    data:  { isRead: true, readAt: new Date() },
  });
}

// ── Mark all read ─────────────────────────────────────────────

export async function markAllRead(userId: string): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  return { count: result.count };
}

// ── Create (internal — called by services and jobs) ───────────

export async function createNotification(data: {
  userId:    string;
  type:      NotificationType;
  title:     string;
  body:      string;
  link?:     string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.notification.create({ data });
}

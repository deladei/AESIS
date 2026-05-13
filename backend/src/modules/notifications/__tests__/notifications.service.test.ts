import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    notification: {
      findMany:   jest.fn(),
      count:      jest.fn(),
      findUnique: jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
      create:     jest.fn(),
    },
  },
}));

import { prisma } from '../../../config/prisma';
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createNotification,
} from '../notifications.service';

const mockNotification = (overrides = {}) => ({
  id:        'notif-1',
  userId:    'user-1',
  type:      'submission_reminder' as const,
  title:     'Test',
  body:      'Test body',
  isRead:    false,
  link:      '/logbook/1',
  metadata:  {},
  createdAt: new Date('2026-01-01T10:00:00Z'),
  readAt:    null,
  ...overrides,
});

// ── listNotifications ─────────────────────────────────────────

describe('listNotifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns paginated notifications for a user', async () => {
    const notifs = [mockNotification()];
    (prisma.notification.findMany as jest.Mock).mockResolvedValue(notifs);
    (prisma.notification.count   as jest.Mock).mockResolvedValue(1);

    const result = await listNotifications('user-1', { page: 1, limit: 20 });

    expect(result.notifications).toEqual(notifs);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('filters unread-only when unreadOnly is true', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count   as jest.Mock).mockResolvedValue(0);

    await listNotifications('user-1', { unreadOnly: true });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isRead: false } }),
    );
  });

  it('does not add isRead filter when unreadOnly is false', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count   as jest.Mock).mockResolvedValue(0);

    await listNotifications('user-1', { unreadOnly: false });

    const call = (prisma.notification.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).not.toHaveProperty('isRead');
  });

  it('orders by createdAt desc', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.notification.count   as jest.Mock).mockResolvedValue(0);

    await listNotifications('user-1');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});

// ── getUnreadCount ────────────────────────────────────────────

describe('getUnreadCount', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns unread count for a user', async () => {
    (prisma.notification.count as jest.Mock).mockResolvedValue(5);

    const count = await getUnreadCount('user-1');

    expect(count).toBe(5);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
    });
  });
});

// ── markRead ──────────────────────────────────────────────────

describe('markRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks a notification as read', async () => {
    const notif   = mockNotification();
    const updated = mockNotification({ isRead: true, readAt: new Date() });
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(notif);
    (prisma.notification.update    as jest.Mock).mockResolvedValue(updated);

    const result = await markRead('notif-1', 'user-1');

    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'notif-1' },
      data:  { isRead: true, readAt: expect.any(Date) },
    });
    expect(result).toEqual(updated);
  });

  it('is idempotent — returns existing notification if already read', async () => {
    const readNotif = mockNotification({ isRead: true, readAt: new Date() });
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(readNotif);

    const result = await markRead('notif-1', 'user-1');

    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(result).toEqual(readNotif);
  });

  it('throws 404 when notification does not exist', async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(markRead('notif-x', 'user-1')).rejects.toThrow(AppError);
    await expect(markRead('notif-x', 'user-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when notification belongs to a different user', async () => {
    (prisma.notification.findUnique as jest.Mock).mockResolvedValue(
      mockNotification({ userId: 'other-user' }),
    );

    await expect(markRead('notif-1', 'user-1')).rejects.toThrow(AppError);
    await expect(markRead('notif-1', 'user-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── markAllRead ───────────────────────────────────────────────

describe('markAllRead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks all unread notifications as read and returns count', async () => {
    (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    const result = await markAllRead('user-1');

    expect(result).toEqual({ count: 3 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data:  { isRead: true, readAt: expect.any(Date) },
    });
  });

  it('returns count 0 when nothing to mark', async () => {
    (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await markAllRead('user-1');

    expect(result).toEqual({ count: 0 });
  });
});

// ── createNotification ────────────────────────────────────────

describe('createNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a notification and returns it', async () => {
    const created = mockNotification();
    (prisma.notification.create as jest.Mock).mockResolvedValue(created);

    const result = await createNotification({
      userId: 'user-1',
      type:   'submission_reminder',
      title:  'Test',
      body:   'Test body',
      link:   '/logbook/1',
    });

    expect(result).toEqual(created);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', type: 'submission_reminder' }),
    });
  });

  it('works without optional fields', async () => {
    const created = mockNotification({ link: null, metadata: null });
    (prisma.notification.create as jest.Mock).mockResolvedValue(created);

    await createNotification({ userId: 'user-1', type: 'system', title: 'Hi', body: 'Body' });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'system', title: 'Hi', body: 'Body' },
    });
  });
});

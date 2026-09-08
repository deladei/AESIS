/**
 * Setting work for a group of students.
 *
 * Two things here are easy to get wrong and expensive when wrong: a supervisor
 * reaching a student they do not supervise, and the shared upload. Assigning
 * one brief to a group stores ONE Cloudinary asset and points every task at it,
 * so deleting a row eagerly would blank the brief for everyone else in the
 * batch. Both are tested below.
 */
const mockPrisma = {
  placement:      { findFirst: jest.fn(), findMany: jest.fn() },
  task:           { create: jest.fn() },
  taskAttachment: { findUnique: jest.fn(), delete: jest.fn(), count: jest.fn() },
  $transaction:   jest.fn(),
};

const mockCloudinary = {
  isCloudinaryConfigured: jest.fn(() => true),
  uploadBuffer: jest.fn(),
  deleteAsset:  jest.fn(),
};

jest.mock('../../../config/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../../config/cloudinary', () => mockCloudinary);
jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as service from '../tasks.service';

const supervisor = { id: 'sup-1', role: 'academic_supervisor' };
const student    = { id: 'stu-1', role: 'student' };

const work = {
  assigneeIds: ['stu-1', 'stu-2'],
  title:       'Week 4 progress report',
  category:    'report' as const,
};

const aFile = (name = 'brief.pdf') => ({
  originalname: name,
  mimetype:     'application/pdf',
  size:         2048,
  buffer:       Buffer.from('pdf'),
});

/** `$transaction(cb)` hands the callback a client; here it is the same mock. */
const runTransaction = () =>
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockPrisma));

beforeEach(() => {
  jest.clearAllMocks();
  mockCloudinary.isCloudinaryConfigured.mockReturnValue(true);
  // The real one returns a promise; the service chains .catch() onto it so that
  // a storage hiccup cannot fail an action that has already succeeded.
  mockCloudinary.deleteAsset.mockResolvedValue(undefined);
  mockPrisma.placement.findMany.mockResolvedValue([]);
  mockPrisma.task.create.mockImplementation(async ({ data }: { data: { assigneeId: string } }) =>
    ({ id: `task-${data.assigneeId}`, assigneeId: data.assigneeId }));
  runTransaction();
});

describe('assignWork — who may set work', () => {
  it('refuses a student outright', async () => {
    await expect(service.assignWork(student, work)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('checks every assignee against the placement table, not the request', async () => {
    mockPrisma.placement.findFirst.mockResolvedValue({ id: 'p-1' });

    await service.assignWork(supervisor, work);

    // Once per student, and the supervisor's own id is what is matched on —
    // never anything the client sent.
    expect(mockPrisma.placement.findFirst).toHaveBeenCalledTimes(2);
    expect(mockPrisma.placement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ academicSupervisorId: 'sup-1', isCurrent: true }),
    }));
  });

  it('creates NOTHING when one student in the list is not supervised', async () => {
    // The whole batch is validated before any write, so a single bad id cannot
    // leave a half-assigned group for someone to reconcile by hand.
    mockPrisma.placement.findFirst
      .mockResolvedValueOnce({ id: 'p-1' })
      .mockResolvedValueOnce(null);

    await expect(service.assignWork(supervisor, work)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
    expect(mockCloudinary.uploadBuffer).not.toHaveBeenCalled();
  });

  it('treats the same student listed twice as one task', async () => {
    mockPrisma.placement.findFirst.mockResolvedValue({ id: 'p-1' });

    const res = await service.assignWork(supervisor, { ...work, assigneeIds: ['stu-1', 'stu-1'] });

    expect(res.created).toBe(1);
    expect(mockPrisma.task.create).toHaveBeenCalledTimes(1);
  });
});

describe('assignWork — the shared upload', () => {
  beforeEach(() => {
    mockPrisma.placement.findFirst.mockResolvedValue({ id: 'p-1' });
    mockCloudinary.uploadBuffer.mockResolvedValue({
      url: 'https://cdn/brief.pdf', publicId: 'aesis/task-attachments/brief', bytes: 2048,
    });
  });

  it('uploads once for the whole group, not once per student', async () => {
    await service.assignWork(supervisor, work, [aFile()]);

    expect(mockCloudinary.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(mockPrisma.task.create).toHaveBeenCalledTimes(2);
  });

  it('points every task at that one asset', async () => {
    await service.assignWork(supervisor, work, [aFile()]);

    for (const call of mockPrisma.task.create.mock.calls) {
      expect(call[0].data.attachments.create[0]).toMatchObject({
        publicId: 'aesis/task-attachments/brief',
        kind:     'document',
        uploadedById: 'sup-1',
      });
    }
  });

  it('classifies an image as an image', async () => {
    await service.assignWork(supervisor, { ...work, assigneeIds: ['stu-1'] },
      [{ ...aFile('diagram.png'), mimetype: 'image/png' }]);

    expect(mockCloudinary.uploadBuffer).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ isImage: true }));
  });

  it('refuses the upload when storage is not configured, rather than half-setting the work', async () => {
    mockCloudinary.isCloudinaryConfigured.mockReturnValue(false);

    await expect(service.assignWork(supervisor, work, [aFile()]))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });

  it('still sets work with no files when storage is unconfigured', async () => {
    // The attachment is optional, so its absence must not disable assigning.
    mockCloudinary.isCloudinaryConfigured.mockReturnValue(false);

    await expect(service.assignWork(supervisor, work)).resolves.toMatchObject({ created: 2 });
  });

  it('cleans up the uploaded asset when the tasks fail to write', async () => {
    // Nothing references it now, so leaving it would be a storage leak that
    // nobody ever goes looking for.
    mockPrisma.$transaction.mockRejectedValue(new Error('db down'));

    await expect(service.assignWork(supervisor, work, [aFile()])).rejects.toThrow('db down');
    expect(mockCloudinary.deleteAsset).toHaveBeenCalledWith('aesis/task-attachments/brief', false);
  });
});

describe('removeTaskAttachment — the shared asset must survive', () => {
  const attachment = {
    id: 'att-1', taskId: 'task-1', publicId: 'shared-brief', kind: 'document',
    task: { createdById: 'sup-1' },
  };

  beforeEach(() => {
    mockPrisma.taskAttachment.findUnique.mockResolvedValue(attachment);
    mockPrisma.taskAttachment.delete.mockResolvedValue(attachment);
  });

  it('keeps the remote file while another task still points at it', async () => {
    // This is the one that matters: removing one student's copy must not blank
    // the brief for everyone else the work was set for.
    mockPrisma.taskAttachment.count.mockResolvedValue(4);

    const res = await service.removeTaskAttachment(supervisor, 'task-1', 'att-1');

    expect(res).toEqual({ removed: true, assetDeleted: false });
    expect(mockPrisma.taskAttachment.delete).toHaveBeenCalled();
    expect(mockCloudinary.deleteAsset).not.toHaveBeenCalled();
  });

  it('deletes the remote file once the last row is gone', async () => {
    mockPrisma.taskAttachment.count.mockResolvedValue(0);

    const res = await service.removeTaskAttachment(supervisor, 'task-1', 'att-1');

    expect(res).toEqual({ removed: true, assetDeleted: true });
    expect(mockCloudinary.deleteAsset).toHaveBeenCalledWith('shared-brief', false);
  });

  it('refuses someone who did not set the work', async () => {
    await expect(
      service.removeTaskAttachment({ id: 'sup-2', role: 'academic_supervisor' }, 'task-1', 'att-1'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.taskAttachment.delete).not.toHaveBeenCalled();
  });

  it('refuses an attachment that belongs to a different task', async () => {
    // Otherwise the task id in the URL is decoration and any attachment could
    // be removed through any task the caller happens to own.
    await expect(service.removeTaskAttachment(supervisor, 'other-task', 'att-1'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.taskAttachment.delete).not.toHaveBeenCalled();
  });

  it('survives the remote delete failing', async () => {
    // The row is already gone; a storage hiccup must not surface as an error on
    // an action that has, from the user's side, succeeded.
    mockPrisma.taskAttachment.count.mockResolvedValue(0);
    mockCloudinary.deleteAsset.mockRejectedValue(new Error('cloudinary down'));

    await expect(service.removeTaskAttachment(supervisor, 'task-1', 'att-1'))
      .resolves.toMatchObject({ removed: true });
  });
});

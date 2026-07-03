import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    logbookEntry: { findUnique: jest.fn() },
    entryDay: { findUnique: jest.fn() },
    entryAttachment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => true),
  uploadBuffer: jest.fn(),
  deleteAsset: jest.fn(),
}));

import { prisma } from '../../../config/prisma';
import * as cloud from '../../../config/cloudinary';
import { addAttachment, listAttachments, deleteAttachment, type IncomingFile } from '../attachments.service';
import type { Actor } from '../entries.policy';

const mp = prisma as unknown as {
  logbookEntry: { findUnique: jest.Mock };
  entryDay: { findUnique: jest.Mock };
  entryAttachment: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
};
const mc = cloud as jest.Mocked<typeof cloud>;

const STUDENT_ID = 'student-1';
const OTHER_ID = 'student-2';
const SUP_ID = 'sup-1';
const ENTRY_ID = '11111111-1111-1111-1111-111111111111';

const student: Actor = { id: STUDENT_ID, role: 'student' };

// A loaded entry shaped like loadEntryForAttachment's select. Period is a
// past week so day-scoped uploads inside it are never "future".
function entry(status: string, period: { start: string; end: string } = { start: '2026-03-02', end: '2026-03-08' }) {
  return {
    id: ENTRY_ID,
    status,
    periodStart: new Date(`${period.start}T00:00:00.000Z`),
    periodEnd: new Date(`${period.end}T00:00:00.000Z`),
    placement: {
      id: 'plc-1',
      studentId: STUDENT_ID,
      academicSupervisorId: SUP_ID,
      companySupervisorId: null,
    },
  };
}

const pngFile: IncomingFile = {
  buffer: Buffer.from('img'),
  originalName: 'evidence.png',
  size: 1234,
  mimeType: 'image/png',
};
const pdfFile: IncomingFile = {
  buffer: Buffer.from('doc'),
  originalName: 'report.pdf',
  size: 4567,
  mimeType: 'application/pdf',
};

beforeEach(() => {
  jest.clearAllMocks();
  mc.isCloudinaryConfigured.mockReturnValue(true);
});

describe('addAttachment', () => {
  it('rejects with 503 when storage is not configured', async () => {
    mc.isCloudinaryConfigured.mockReturnValue(false);
    await expect(addAttachment(student, ENTRY_ID, pngFile)).rejects.toMatchObject({ statusCode: 503 });
    expect(mp.logbookEntry.findUnique).not.toHaveBeenCalled();
  });

  it('404s when the entry does not exist', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(null);
    await expect(addAttachment(student, ENTRY_ID, pngFile)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('403s for a non-owning student', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    await expect(
      addAttachment({ id: OTHER_ID, role: 'student' }, ENTRY_ID, pngFile),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('403s for an academic supervisor (never authors evidence)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    await expect(
      addAttachment({ id: SUP_ID, role: 'academic_supervisor' }, ENTRY_ID, pngFile),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('409s a week-level (no day) upload when the entry is not editable (submitted)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('submitted'));
    await expect(addAttachment(student, ENTRY_ID, pngFile)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows a day-scoped upload while the week is in review but the day is still a draft', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('submitted'));
    mp.entryDay.findUnique.mockResolvedValue({ status: 'draft' });
    mp.entryAttachment.count.mockResolvedValue(0);
    mc.uploadBuffer.mockResolvedValue({ url: 'https://cdn/d.png', publicId: 'aesis/entries/d', bytes: 1 });
    mp.entryAttachment.create.mockImplementation(async ({ data }: any) => ({ id: 'att-d', ...data }));

    await addAttachment(student, ENTRY_ID, pngFile, '2026-03-04');

    expect(mp.entryAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dayDate: new Date('2026-03-04T00:00:00.000Z') }),
      }),
    );
  });

  it('409s a day-scoped upload when that day is already submitted (week not returned)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('submitted'));
    mp.entryDay.findUnique.mockResolvedValue({ status: 'submitted' });
    await expect(addAttachment(student, ENTRY_ID, pngFile, '2026-03-04')).rejects.toMatchObject({ statusCode: 409 });
    expect(mc.uploadBuffer).not.toHaveBeenCalled();
  });

  it('allows re-attaching to a submitted day when the week was returned', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('returned'));
    mp.entryDay.findUnique.mockResolvedValue({ status: 'submitted' });
    mp.entryAttachment.count.mockResolvedValue(0);
    mc.uploadBuffer.mockResolvedValue({ url: 'https://cdn/r.png', publicId: 'aesis/entries/r2', bytes: 1 });
    mp.entryAttachment.create.mockImplementation(async ({ data }: any) => ({ id: 'att-r', ...data }));

    await expect(addAttachment(student, ENTRY_ID, pngFile, '2026-03-04')).resolves.toBeDefined();
  });

  it('422s a day outside the week period', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    await expect(addAttachment(student, ENTRY_ID, pngFile, '2026-02-20')).rejects.toMatchObject({ statusCode: 422 });
  });

  it('422s a day in the future', async () => {
    const start = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft', { start, end }));
    await expect(addAttachment(student, ENTRY_ID, pngFile, future)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('422s when the entry already has the max number of attachments', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    mp.entryAttachment.count.mockResolvedValue(10);
    await expect(addAttachment(student, ENTRY_ID, pngFile)).rejects.toMatchObject({ statusCode: 422 });
    expect(mc.uploadBuffer).not.toHaveBeenCalled();
  });

  it('uploads an image as kind=image and persists secure_url + public_id', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    mp.entryAttachment.count.mockResolvedValue(0);
    mc.uploadBuffer.mockResolvedValue({ url: 'https://cdn/x.png', publicId: 'aesis/entries/x', bytes: 1234 });
    mp.entryAttachment.create.mockImplementation(async ({ data }: any) => ({ id: 'att-1', ...data }));

    await addAttachment(student, ENTRY_ID, pngFile);

    expect(mc.uploadBuffer).toHaveBeenCalledWith(pngFile.buffer, {
      folder: `aesis/entries/${ENTRY_ID}`,
      isImage: true,
    });
    expect(mp.entryAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryId: ENTRY_ID,
          fileUrl: 'https://cdn/x.png',
          publicId: 'aesis/entries/x',
          kind: 'image',
          uploadedById: STUDENT_ID,
        }),
      }),
    );
  });

  it('uploads a PDF as kind=document (raw, isImage=false) on a returned entry', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('returned'));
    mp.entryAttachment.count.mockResolvedValue(0);
    mc.uploadBuffer.mockResolvedValue({ url: 'https://cdn/r.pdf', publicId: 'aesis/entries/r', bytes: 4567 });
    mp.entryAttachment.create.mockImplementation(async ({ data }: any) => ({ id: 'att-2', ...data }));

    await addAttachment(student, ENTRY_ID, pdfFile);

    expect(mc.uploadBuffer).toHaveBeenCalledWith(pdfFile.buffer, expect.objectContaining({ isImage: false }));
    expect(mp.entryAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'document' }) }),
    );
  });
});

describe('listAttachments', () => {
  it('allows a coordinator (read scope) and returns the rows', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('acknowledged'));
    mp.entryAttachment.findMany.mockResolvedValue([{ id: 'att-1' }]);
    const rows = await listAttachments({ id: 'coord-1', role: 'coordinator' }, ENTRY_ID);
    expect(rows).toEqual([{ id: 'att-1' }]);
  });

  it('403s for an unrelated company supervisor', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    await expect(
      listAttachments({ id: 'other-cs', role: 'company_supervisor' }, ENTRY_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('deleteAttachment', () => {
  it('deletes the remote asset then the row', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    mp.entryAttachment.findFirst.mockResolvedValue({ id: 'att-1', publicId: 'aesis/entries/x', kind: 'image', dayDate: null });

    await deleteAttachment(student, ENTRY_ID, 'att-1');

    expect(mc.deleteAsset).toHaveBeenCalledWith('aesis/entries/x', true);
    expect(mp.entryAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
  });

  it('404s when the attachment is not on this entry', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('draft'));
    mp.entryAttachment.findFirst.mockResolvedValue(null);
    await expect(deleteAttachment(student, ENTRY_ID, 'missing')).rejects.toMatchObject({ statusCode: 404 });
    expect(mp.entryAttachment.delete).not.toHaveBeenCalled();
  });

  it('409s when the entry is locked (acknowledged)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('acknowledged'));
    mp.entryAttachment.findFirst.mockResolvedValue({ id: 'att-1', publicId: 'aesis/entries/x', kind: 'image', dayDate: null });
    await expect(deleteAttachment(student, ENTRY_ID, 'att-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('409s deleting a day-scoped file whose day is submitted (week not returned)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('submitted'));
    mp.entryAttachment.findFirst.mockResolvedValue({
      id: 'att-1', publicId: 'aesis/entries/x', kind: 'image', dayDate: new Date('2026-03-04T00:00:00.000Z'),
    });
    mp.entryDay.findUnique.mockResolvedValue({ status: 'submitted' });
    await expect(deleteAttachment(student, ENTRY_ID, 'att-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(mp.entryAttachment.delete).not.toHaveBeenCalled();
  });

  it('deletes a day-scoped file while its day is still a draft (week in review)', async () => {
    mp.logbookEntry.findUnique.mockResolvedValue(entry('submitted'));
    mp.entryAttachment.findFirst.mockResolvedValue({
      id: 'att-2', publicId: 'aesis/entries/y', kind: 'document', dayDate: new Date('2026-03-05T00:00:00.000Z'),
    });
    mp.entryDay.findUnique.mockResolvedValue({ status: 'draft' });

    await deleteAttachment(student, ENTRY_ID, 'att-2');

    expect(mp.entryAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-2' } });
  });
});

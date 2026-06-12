jest.mock('../../../config/prisma', () => ({
  prisma: {
    placement:         { findUnique: jest.fn() },
    logbookEntry:      { findUnique: jest.fn() },
    learningObjective: { create: jest.fn(), findMany: jest.fn() },
    entryObjective: {
      findMany: jest.fn(), upsert: jest.fn(), createMany: jest.fn(),
      findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), deleteMany: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));

import { prisma } from '../../../config/prisma';
import * as service from '../objectives.service';
import type { Actor } from '../../entries/entries.policy';

const mp = prisma as unknown as {
  placement: { findUnique: jest.Mock };
  logbookEntry: { findUnique: jest.Mock };
  learningObjective: { create: jest.Mock; findMany: jest.Mock };
  entryObjective: {
    findMany: jest.Mock; upsert: jest.Mock; createMany: jest.Mock;
    findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock; deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const SUPERVISOR: Actor = { id: 'sup-1', role: 'academic_supervisor' };
const STUDENT:    Actor = { id: 'stu-1', role: 'student' };
const ADMIN:      Actor = { id: 'adm-1', role: 'admin' };
const OWNERSHIP = { id: 'p-1', studentId: 'stu-1', academicSupervisorId: 'sup-1', companySupervisorId: null };

beforeEach(() => {
  jest.clearAllMocks();
  mp.placement.findUnique.mockResolvedValue(OWNERSHIP);
  mp.logbookEntry.findUnique.mockResolvedValue({ placement: OWNERSHIP });
  mp.$transaction.mockResolvedValue([]);
  mp.entryObjective.findMany.mockResolvedValue([]);
});

// ── defineObjective ──
describe('defineObjective', () => {
  it('lets the assigned academic supervisor define an objective', async () => {
    mp.learningObjective.create.mockResolvedValue({ id: 'o-1', title: 'Use Git', description: null, createdAt: new Date() });
    const r = await service.defineObjective(SUPERVISOR, 'p-1', { title: 'Use Git' });
    expect(r.id).toBe('o-1');
    expect(mp.learningObjective.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ placementId: 'p-1', title: 'Use Git', createdById: 'sup-1' }) }),
    );
  });

  it('forbids a student from defining objectives', async () => {
    await expect(service.defineObjective(STUDENT, 'p-1', { title: 'x' })).rejects.toThrow('academic supervisor');
    expect(mp.learningObjective.create).not.toHaveBeenCalled();
  });

  it('forbids a supervisor who is not assigned to the placement', async () => {
    await expect(service.defineObjective({ id: 'other', role: 'academic_supervisor' }, 'p-1', { title: 'x' }))
      .rejects.toThrow('academic supervisor');
  });
});

// ── listObjectives (progress) ──
describe('listObjectives', () => {
  it('counts CONFIRMED links only and surfaces suggested separately', async () => {
    mp.learningObjective.findMany.mockResolvedValue([
      { id: 'o-1', title: 'Git', description: null, createdAt: new Date(),
        entryLinks: [{ status: 'confirmed' }, { status: 'confirmed' }, { status: 'suggested' }] },
      { id: 'o-2', title: 'Tests', description: null, createdAt: new Date(), entryLinks: [{ status: 'suggested' }] },
    ]);
    const r = await service.listObjectives(STUDENT, 'p-1');
    expect(r).toEqual([
      { id: 'o-1', title: 'Git',   description: null, createdAt: expect.any(Date), confirmedEntryCount: 2, suggestedEntryCount: 1 },
      { id: 'o-2', title: 'Tests', description: null, createdAt: expect.any(Date), confirmedEntryCount: 0, suggestedEntryCount: 1 },
    ]);
  });

  it('forbids a student from listing another student\'s placement objectives', async () => {
    mp.placement.findUnique.mockResolvedValue({ ...OWNERSHIP, studentId: 'someone-else' });
    await expect(service.listObjectives(STUDENT, 'p-1')).rejects.toThrow('Access denied');
  });
});

// ── addEntryObjectives (human, confirmed) ──
describe('addEntryObjectives', () => {
  it('lets the student map their own entry — upserts confirmed/human links', async () => {
    mp.learningObjective.findMany.mockResolvedValue([{ id: 'o-1' }, { id: 'o-2' }]); // both valid on placement
    await service.addEntryObjectives(STUDENT, 'e-1', ['o-1', 'o-2']);
    expect(mp.$transaction).toHaveBeenCalled();
    expect(mp.entryObjective.upsert).toHaveBeenCalledTimes(2);
    const call = mp.entryObjective.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({ status: 'confirmed', source: 'human', confirmedById: 'stu-1' });
    expect(call.update).toMatchObject({ status: 'confirmed' }); // promoting keeps source untouched
  });

  it('rejects objective ids that do not belong to the placement', async () => {
    mp.learningObjective.findMany.mockResolvedValue([{ id: 'o-1' }]); // only 1 of 2 valid
    await expect(service.addEntryObjectives(STUDENT, 'e-1', ['o-1', 'o-foreign'])).rejects.toThrow('do not belong');
    expect(mp.$transaction).not.toHaveBeenCalled();
  });

  it('forbids a supervisor from authoring entry links (read-only on content)', async () => {
    await expect(service.addEntryObjectives(SUPERVISOR, 'e-1', ['o-1'])).rejects.toThrow('Only the student');
  });
});

// ── suggestEntryObjectives (AI, advisory) ──
describe('suggestEntryObjectives', () => {
  it('forbids non-admin actors (only the system suggests)', async () => {
    await expect(service.suggestEntryObjectives(STUDENT, 'e-1', ['o-1'])).rejects.toThrow('system only');
  });

  it('inserts only the not-yet-linked ids as suggested/ai (never overrides existing)', async () => {
    mp.learningObjective.findMany.mockResolvedValue([{ id: 'o-1' }, { id: 'o-2' }]);
    // o-1 already linked (e.g. human-confirmed) — must be left alone.
    mp.entryObjective.findMany
      .mockResolvedValueOnce([{ objectiveId: 'o-1' }]) // existing
      .mockResolvedValueOnce([]);                       // final list (listEntryObjectives)
    await service.suggestEntryObjectives(ADMIN, 'e-1', ['o-1', 'o-2']);
    expect(mp.entryObjective.createMany).toHaveBeenCalledWith({
      data: [{ entryId: 'e-1', objectiveId: 'o-2', status: 'suggested', source: 'ai' }],
    });
  });

  it('rejects suggested ids that are not objectives of the placement', async () => {
    mp.learningObjective.findMany.mockResolvedValue([]); // none valid
    await expect(service.suggestEntryObjectives(ADMIN, 'e-1', ['o-x'])).rejects.toThrow('do not belong');
    expect(mp.entryObjective.createMany).not.toHaveBeenCalled();
  });
});

// ── confirmEntryObjective ──
describe('confirmEntryObjective', () => {
  it('flips a suggestion to confirmed and records the confirmer', async () => {
    mp.entryObjective.findUnique.mockResolvedValue({ id: 'link-1', status: 'suggested' });
    mp.entryObjective.update.mockResolvedValue({ id: 'link-1', status: 'confirmed' });
    await service.confirmEntryObjective(STUDENT, 'e-1', 'o-1');
    expect(mp.entryObjective.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed', confirmedById: 'stu-1' }) }),
    );
  });

  it('404s when the link does not exist', async () => {
    mp.entryObjective.findUnique.mockResolvedValue(null);
    await expect(service.confirmEntryObjective(STUDENT, 'e-1', 'o-1')).rejects.toThrow('not found');
  });

  it('is idempotent on an already-confirmed link (no extra write)', async () => {
    mp.entryObjective.findUnique.mockResolvedValue({ id: 'link-1', status: 'confirmed' });
    mp.entryObjective.findUniqueOrThrow.mockResolvedValue({ id: 'link-1', status: 'confirmed' });
    await service.confirmEntryObjective(STUDENT, 'e-1', 'o-1');
    expect(mp.entryObjective.update).not.toHaveBeenCalled();
  });
});

// ── removeEntryObjective ──
describe('removeEntryObjective', () => {
  it('lets the student remove a link on their own entry', async () => {
    mp.entryObjective.deleteMany.mockResolvedValue({ count: 1 });
    const r = await service.removeEntryObjective(STUDENT, 'e-1', 'o-1');
    expect(r).toEqual({ removed: true });
    expect(mp.entryObjective.deleteMany).toHaveBeenCalledWith({ where: { entryId: 'e-1', objectiveId: 'o-1' } });
  });
});

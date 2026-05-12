import { AppError } from '../../../middleware/errorHandler';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    logbookSubmission: {
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      update:     jest.fn(),
      count:      jest.fn(),
    },
    logbookAttachment: { create: jest.fn() },
    supervisorFeedback: { create: jest.fn() },
    notification:      { create: jest.fn() },
    auditLog:          { create: jest.fn() },
    placement:         { findUnique: jest.fn() },
    $transaction:      jest.fn(),
  },
}));

jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV:       'test',
    BCRYPT_ROUNDS:  4,
    ENCRYPTION_KEY: 'a'.repeat(64),
    FRONTEND_URL:   'http://localhost:5173',
  },
}));

import { prisma } from '../../../config/prisma';
import * as service from '../logbook.service';

const mp = prisma as jest.Mocked<typeof prisma>;

// ── Fixtures ──────────────────────────────────────────────────

const futureDeadline = new Date(Date.now() + 86_400_000 * 7);
const pastDeadline   = new Date(Date.now() - 86_400_000 * 1);

const fakePlacement = {
  id: 'pl-1', studentId: 'student-1', academicSupervisorId: 'sup-1',
  companyId: 'co-1', companySupervisorId: 'csu-1', academicYearId: 'ay-1',
  placementStatus: 'active', startDate: new Date(), endDate: new Date(),
  approvedAt: null, approvedBy: null, rejectionReason: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const fakeSubmission = {
  id: 'sub-1', placementId: 'pl-1', studentId: 'student-1',
  weekNumber: 1, mongoDocId: null,
  submissionStatus: 'draft' as const,
  aiAnalysisStatus: 'pending' as const,
  submittedAt: null, isLate: false,
  deadline: futureDeadline,
  createdAt: new Date(), updatedAt: new Date(),
  attachments: [], analysis: null,
  placement: { academicSupervisorId: 'sup-1', studentId: 'student-1' },
};

beforeEach(() => jest.clearAllMocks());

// ── getOrCreateDraft ──────────────────────────────────────────

describe('service.getOrCreateDraft', () => {
  it('returns submission when found and owned by student', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    const result = await service.getOrCreateDraft('student-1', 'pl-1', 1);
    expect(result.id).toBe('sub-1');
  });

  it('throws 404 when week slot does not exist', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getOrCreateDraft('student-1', 'pl-1', 99))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when submission belongs to a different student', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    await expect(service.getOrCreateDraft('other-student', 'pl-1', 1))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── saveDraft ─────────────────────────────────────────────────

describe('service.saveDraft', () => {
  const draftInput = {
    tasksCompleted:   'Set up CI pipeline',
    technologiesUsed: 'GitHub Actions, Docker',
    challenges:       'YAML indentation',
    reflection:       'Learned about matrix strategies',
    hoursWorked:      40,
  };

  it('saves draft content and returns updated submission', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    (mp.logbookSubmission.update as jest.Mock).mockResolvedValue({
      ...fakeSubmission, mongoDocId: 'mongo_stub_sub-1_123',
    });

    const result = await service.saveDraft('sub-1', 'student-1', draftInput);
    expect(mp.logbookSubmission.update).toHaveBeenCalledTimes(1);
    expect(result.mongoDocId).toMatch(/mongo_stub/);
  });

  it('throws 404 when submission not found', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.saveDraft('bad-id', 'student-1', draftInput))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when student does not own the submission', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    await expect(service.saveDraft('sub-1', 'other-student', draftInput))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 when submission is already submitted', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, submissionStatus: 'submitted',
    });
    await expect(service.saveDraft('sub-1', 'student-1', draftInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── submitLogbook ─────────────────────────────────────────────

describe('service.submitLogbook', () => {
  it('submits a draft with content before deadline', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, mongoDocId: 'mongo_stub_sub-1_123',
    });
    (mp.logbookSubmission.update as jest.Mock).mockResolvedValue({
      ...fakeSubmission, submissionStatus: 'submitted', submittedAt: new Date(),
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.submitLogbook('sub-1', 'student-1');
    expect(result.submissionStatus).toBe('submitted');
    expect(mp.logbookSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ submissionStatus: 'submitted' }),
      })
    );
  });

  it('marks submission as late when past deadline', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, mongoDocId: 'mongo_stub_sub-1_123', deadline: pastDeadline,
    });
    (mp.logbookSubmission.update as jest.Mock).mockResolvedValue({
      ...fakeSubmission, submissionStatus: 'submitted', isLate: true,
      student: { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo' },
    });
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    await service.submitLogbook('sub-1', 'student-1');
    expect(mp.logbookSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isLate: true }),
      })
    );
  });

  it('throws 422 when no draft content saved yet', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, mongoDocId: null,
    });
    await expect(service.submitLogbook('sub-1', 'student-1'))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 409 when already submitted', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, submissionStatus: 'submitted', mongoDocId: 'mongo_stub',
    });
    await expect(service.submitLogbook('sub-1', 'student-1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when submission not found', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.submitLogbook('bad-id', 'student-1'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 for wrong student', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, mongoDocId: 'mongo_stub',
    });
    await expect(service.submitLogbook('sub-1', 'other-student'))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── getSubmission ─────────────────────────────────────────────

describe('service.getSubmission', () => {
  const fullSubmission = {
    ...fakeSubmission,
    student:  { id: 'student-1', firstName: 'Ada', lastName: 'Okonkwo', email: 's@cs.edu' },
    feedback: [],
    placement: { academicSupervisorId: 'sup-1' },
  };

  it('returns submission for student owner', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fullSubmission);
    const result = await service.getSubmission('sub-1', 'student-1', 'student');
    expect(result.id).toBe('sub-1');
  });

  it('returns submission for assigned supervisor', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fullSubmission);
    const result = await service.getSubmission('sub-1', 'sup-1', 'academic_supervisor');
    expect(result.id).toBe('sub-1');
  });

  it('throws 403 for unrelated supervisor', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fullSubmission);
    await expect(service.getSubmission('sub-1', 'other-sup', 'academic_supervisor'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 for unknown submission', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.getSubmission('bad-id', 'student-1', 'student'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('coordinator can access any submission', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fullSubmission);
    const result = await service.getSubmission('sub-1', 'coord-1', 'coordinator');
    expect(result.id).toBe('sub-1');
  });
});

// ── addAttachment ─────────────────────────────────────────────

describe('service.addAttachment', () => {
  const file = { url: 'uploads/sub-1/file.pdf', name: 'report.pdf', size: 50000, mimeType: 'application/pdf' };

  it('creates attachment on a draft submission', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    (mp.logbookAttachment.create as jest.Mock).mockResolvedValue({ id: 'att-1', ...file, submissionId: 'sub-1', uploadedAt: new Date() });

    const result = await service.addAttachment('sub-1', 'student-1', file);
    expect(result.id).toBe('att-1');
  });

  it('throws 409 when submission is approved', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...fakeSubmission, submissionStatus: 'approved',
    });
    await expect(service.addAttachment('sub-1', 'student-1', file))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 403 for wrong student', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(fakeSubmission);
    await expect(service.addAttachment('sub-1', 'other-student', file))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── submitFeedback ────────────────────────────────────────────

describe('service.submitFeedback', () => {
  const feedbackInput = {
    feedbackText: 'Good depth of reflection on the CI challenges encountered.',
    rating:       4,
    outcome:      'approved' as const,
  };

  const submittedSubmission = {
    ...fakeSubmission,
    submissionStatus: 'submitted' as const,
    mongoDocId: 'mongo_stub',
    placement: { academicSupervisorId: 'sup-1', studentId: 'student-1' },
  };

  it('submits feedback, updates status, creates notification', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(submittedSubmission);
    (mp.$transaction as jest.Mock).mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops.map((op) => (op instanceof Promise ? op : Promise.resolve(op))))
    );
    (mp.supervisorFeedback.create as jest.Mock).mockResolvedValue({ id: 'fb-1', ...feedbackInput, submissionId: 'sub-1', supervisorId: 'sup-1', submittedAt: new Date() });
    (mp.logbookSubmission.update as jest.Mock).mockResolvedValue({ ...submittedSubmission, submissionStatus: 'approved' });
    (mp.notification.create as jest.Mock).mockResolvedValue({});
    (mp.auditLog.create as jest.Mock).mockResolvedValue({});

    const result = await service.submitFeedback('sub-1', 'sup-1', feedbackInput);
    expect(result.id).toBe('fb-1');
    expect(mp.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws 403 when supervisor is not assigned to the placement', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(submittedSubmission);
    await expect(service.submitFeedback('sub-1', 'wrong-sup', feedbackInput))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 when submission is not yet submitted', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue({
      ...submittedSubmission, submissionStatus: 'draft',
    });
    await expect(service.submitFeedback('sub-1', 'sup-1', feedbackInput))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when submission not found', async () => {
    (mp.logbookSubmission.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.submitFeedback('bad-id', 'sup-1', feedbackInput))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});

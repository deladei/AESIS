import { prisma } from '../../config/prisma';
import { getMongo, COLLECTIONS } from '../../config/mongo';
import { AppError } from '../../middleware/errorHandler';
import { paginate, buildMeta } from '../../shared/utils/pagination';
import { emitToUser } from '../../shared/utils/socketEmitter';
import { sanitizeLogbookText } from '../../shared/utils/sanitize';
import type { SaveDraftInput, FeedbackInput } from './logbook.schema';

// ── Draft management ──────────────────────────────────────────

export async function getOrCreateDraft(
  studentId: string,
  placementId: string,
  weekNumber: number,
) {
  // Week slot must have been pre-created at placement approval
  const submission = await prisma.logbookSubmission.findUnique({
    where:   { placementId_weekNumber: { placementId, weekNumber } },
    include: { attachments: true, analysis: true },
  });

  if (!submission) throw new AppError(404, `No logbook slot found for week ${weekNumber}`);
  if (submission.studentId !== studentId) throw new AppError(403, 'Access denied');

  return submission;
}

export async function saveDraft(
  submissionId: string,
  studentId: string,
  input: SaveDraftInput,
) {
  const submission = await prisma.logbookSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError(404, 'Submission not found');
  if (submission.studentId !== studentId) throw new AppError(403, 'Access denied');

  if (submission.submissionStatus !== 'draft') {
    throw new AppError(409, 'Cannot edit a submission that has already been submitted');
  }

  const sanitized = sanitizeLogbookText(input);

  // Store rich content in MongoDB; save a reference ID back to PG
  const mongoDocId = await upsertMongoLogbook(submission.mongoDocId, {
    submissionId,
    studentId,
    placementId:      submission.placementId,
    weekNumber:       submission.weekNumber,
    tasksCompleted:   sanitized.tasksCompleted,
    technologiesUsed: sanitized.technologiesUsed,
    challenges:       sanitized.challenges ?? '',
    reflection:       sanitized.reflection ?? '',
    hoursWorked:      input.hoursWorked ?? 0,
    updatedAt:        new Date(),
  });

  return prisma.logbookSubmission.update({
    where: { id: submissionId },
    data:  {
      mongoDocId,
      ...(input.hoursWorked !== undefined && {}), // hoursWorked lives in Mongo only
    },
    include: { attachments: true },
  });
}

export async function submitLogbook(submissionId: string, studentId: string) {
  const submission = await prisma.logbookSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError(404, 'Submission not found');
  if (submission.studentId !== studentId) throw new AppError(403, 'Access denied');

  if (['submitted', 'under_review', 'approved', 'flagged'].includes(submission.submissionStatus)) {
    throw new AppError(409, 'Submission has already been submitted');
  }

  if (!submission.mongoDocId) {
    throw new AppError(422, 'Cannot submit an empty logbook — save a draft first');
  }

  const now = new Date();
  const isLate = now > submission.deadline;

  const updated = await prisma.logbookSubmission.update({
    where: { id: submissionId },
    data: {
      submissionStatus: 'submitted',
      submittedAt:      now,
      isLate,
    },
    include: {
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId:     studentId,
      action:     'logbook_override',
      entityType: 'logbook_submission',
      entityId:   submissionId,
      metadata:   { weekNumber: submission.weekNumber, isLate },
    },
  });

  return updated;
}

// ── Read ──────────────────────────────────────────────────────

export async function getSubmission(
  submissionId: string,
  requesterId: string,
  requesterRole: string,
) {
  const submission = await prisma.logbookSubmission.findUnique({
    where:   { id: submissionId },
    include: {
      student:     { select: { id: true, firstName: true, lastName: true, email: true } },
      attachments: true,
      analysis:    true,
      feedback:    {
        include: { supervisor: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { submittedAt: 'desc' },
      },
      placement: { select: { academicSupervisorId: true } },
    },
  });

  if (!submission) throw new AppError(404, 'Submission not found');

  if (requesterRole === 'student' && submission.studentId !== requesterId) {
    throw new AppError(403, 'Access denied');
  }
  if (
    requesterRole === 'academic_supervisor' &&
    submission.placement.academicSupervisorId !== requesterId
  ) {
    throw new AppError(403, 'Access denied');
  }

  return submission;
}

export async function listSubmissions(
  placementId: string,
  requesterId: string,
  requesterRole: string,
  page = 1,
  limit = 24,
) {
  // Verify access to this placement
  const placement = await prisma.placement.findUnique({ where: { id: placementId } });
  if (!placement) throw new AppError(404, 'Placement not found');

  if (requesterRole === 'student' && placement.studentId !== requesterId) {
    throw new AppError(403, 'Access denied');
  }
  if (
    requesterRole === 'academic_supervisor' &&
    placement.academicSupervisorId !== requesterId
  ) {
    throw new AppError(403, 'Access denied');
  }

  const { skip, take } = paginate(page, limit);

  const [submissions, total] = await Promise.all([
    prisma.logbookSubmission.findMany({
      where:   { placementId },
      skip,
      take,
      orderBy: { weekNumber: 'asc' },
      include: {
        analysis:    { select: { qualityScore: true, isPlagiarismFlagged: true, isRelevanceFlagged: true } },
        _count:      { select: { attachments: true, feedback: true } },
      },
    }),
    prisma.logbookSubmission.count({ where: { placementId } }),
  ]);

  return { submissions, meta: buildMeta(total, page, limit) };
}

// ── Attachments ───────────────────────────────────────────────

export async function addAttachment(
  submissionId: string,
  studentId: string,
  file: { url: string; name: string; size: number; mimeType: string },
) {
  const submission = await prisma.logbookSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new AppError(404, 'Submission not found');
  if (submission.studentId !== studentId) throw new AppError(403, 'Access denied');

  if (['approved', 'flagged'].includes(submission.submissionStatus)) {
    throw new AppError(409, 'Cannot add attachments to a graded submission');
  }

  return prisma.logbookAttachment.create({
    data: {
      submissionId,
      fileUrl:  file.url,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.mimeType,
    },
  });
}

export async function listAttachments(submissionId: string, requesterId: string, requesterRole: string) {
  // Reuse getSubmission for access control, then return attachments
  const submission = await getSubmission(submissionId, requesterId, requesterRole);
  return submission.attachments;
}

// ── Supervisor Feedback ───────────────────────────────────────

export async function submitFeedback(
  submissionId: string,
  supervisorId: string,
  input: FeedbackInput,
) {
  const submission = await prisma.logbookSubmission.findUnique({
    where:   { id: submissionId },
    include: { placement: { select: { academicSupervisorId: true, studentId: true } } },
  });
  if (!submission) throw new AppError(404, 'Submission not found');

  if (submission.placement.academicSupervisorId !== supervisorId) {
    throw new AppError(403, 'You are not the assigned supervisor for this placement');
  }

  if (!['submitted', 'under_review'].includes(submission.submissionStatus)) {
    throw new AppError(409, 'Submission must be in submitted or under_review status to receive feedback');
  }

  const [feedback, , notification] = await prisma.$transaction([
    prisma.supervisorFeedback.create({
      data: {
        submissionId,
        supervisorId,
        feedbackText: input.feedbackText,
        rating:       input.rating ?? null,
      },
    }),
    prisma.logbookSubmission.update({
      where: { id: submissionId },
      data:  { submissionStatus: input.outcome },
    }),
    prisma.notification.create({
      data: {
        userId: submission.placement.studentId,
        type:   'feedback_received',
        title:  `Feedback received for Week ${submission.weekNumber}`,
        body:   `Your supervisor has ${input.outcome === 'approved' ? 'approved' : 'flagged'} your Week ${submission.weekNumber} logbook.`,
        link:   `/logbook/${submissionId}`,
        metadata: { submissionId, weekNumber: submission.weekNumber, outcome: input.outcome },
      },
    }),
    prisma.auditLog.create({
      data: {
        userId:     supervisorId,
        action:     'logbook_override',
        entityType: 'logbook_submission',
        entityId:   submissionId,
        metadata:   { outcome: input.outcome, weekNumber: submission.weekNumber },
      },
    }),
  ]);

  emitToUser(submission.placement.studentId, 'notification:new', {
    id:        notification.id,
    type:      notification.type,
    title:     notification.title,
    body:      notification.body,
    link:      notification.link,
    createdAt: notification.createdAt,
  });

  return feedback;
}

// ── Internal helpers ──────────────────────────────────────────

async function upsertMongoLogbook(
  existingDocId: string | null,
  data: Record<string, unknown>,
): Promise<string> {
  const id = (data['submissionId'] as string);
  const db = getMongo();
  if (!db) return id; // MongoDB not available — skip document store

  const col = db.collection(COLLECTIONS.LOGBOOK_ENTRIES);
  await col.updateOne(
    { submissionId: id },
    { $set: { ...data, updatedAt: new Date() } },
    { upsert: true },
  );

  return id;
}

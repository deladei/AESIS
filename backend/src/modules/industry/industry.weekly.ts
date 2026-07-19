import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import { authorizePlacement } from '../entries/entries.policy';
import { resolveAssessmentToken } from './industry.token';
import type { PaperWeeklyCommentInput, DigitalWeeklyCommentInput } from './industry.schema';

// The logbook's weekly comment block — each unit supervisor comments on the
// week, over their name, unit and date. FORMATIVE: the student reads it, so
// reads go through the entries placement policy (own / assigned / staff), not
// the sealed-envelope rule. Writes leave evidence exactly like the
// confidential assessment: paper → scan + staff enterer; digital → the
// single-use week-scoped token, consumed in the same transaction.

const isStaff = (a: Actor) => a.role === 'admin' || a.role === 'coordinator' || a.role === 'hod';

/** Formative read — student (own), assigned supervisors, staff. */
export async function listWeeklyComments(actor: Actor, placementId: string, weekNumber?: number) {
  await authorizePlacement(actor, placementId, 'read');
  return prisma.industryWeeklyComment.findMany({
    where: { placementId, ...(weekNumber != null ? { weekNumber } : {}) },
    include: {
      industrySupervisor: { select: { id: true, name: true, designation: true, verificationStatus: true } },
    },
    orderBy: [{ weekNumber: 'asc' }, { commentDate: 'asc' }],
  });
}

/** Paper path: staff keys in a scanned weekly comment. The scan is the evidence. */
export async function submitPaperWeeklyComment(
  actor: Actor,
  placementId: string,
  input: PaperWeeklyCommentInput,
) {
  if (!isStaff(actor)) {
    throw new AppError(403, 'Only the coordinator may enter a paper weekly comment');
  }

  const supervisor = await prisma.industrySupervisor.findUnique({
    where: { id: input.industrySupervisorId },
    select: { id: true, placementId: true, name: true, departmentUnit: true },
  });
  if (!supervisor || supervisor.placementId !== placementId) {
    throw new AppError(404, 'Industry supervisor not found on this placement');
  }

  const placement = await prisma.placement.findUniqueOrThrow({
    where: { id: placementId },
    select: { studentId: true },
  });

  return prisma.industryWeeklyComment.create({
    data: {
      placementId,
      studentId:            placement.studentId,
      industrySupervisorId: supervisor.id,
      weekNumber:           input.weekNumber,
      comment:              input.comment,
      supervisorName:       input.supervisorName ?? supervisor.name,
      departmentUnit:       input.departmentUnit ?? supervisor.departmentUnit,
      commentDate:          input.commentDate,
      origin:               'paper',
      scanUrl:              input.scanUrl,
      enteredById:          actor.id,
      tokenId:              null,
    },
  });
}

/** Context for the public form: who comments on whom, which week. No data exposed. */
export async function getWeeklyCommentFormContext(rawToken: string) {
  const token = await resolveAssessmentToken(rawToken, 'weekly_comment');
  const placement = await prisma.placement.findUniqueOrThrow({
    where: { id: token.placementId },
    select: {
      student: { select: { firstName: true, lastName: true } },
      company: { select: { name: true } },
    },
  });
  return {
    supervisorName: token.industrySupervisor.name,
    studentName: `${placement.student.firstName} ${placement.student.lastName}`,
    companyName: placement.company?.name ?? null,
    weekNumber: token.weekNumber,
    expiresAt: token.expiresAt,
  };
}

/**
 * Digital path: the unit supervisor submits through their single-use link.
 * Week number comes from the TOKEN (issued scoped), never from the body. The
 * token is consumed in the SAME transaction as the write it authorizes.
 */
export async function submitDigitalWeeklyComment(rawToken: string, input: DigitalWeeklyCommentInput) {
  const token = await resolveAssessmentToken(rawToken, 'weekly_comment');
  if (token.weekNumber == null) {
    // The DB trigger makes this unreachable for new tokens; belt-and-braces.
    throw new AppError(409, 'This link is not bound to a week');
  }

  const [placement, supervisor] = await Promise.all([
    prisma.placement.findUniqueOrThrow({
      where: { id: token.placementId },
      select: { studentId: true },
    }),
    prisma.industrySupervisor.findUniqueOrThrow({
      where: { id: token.industrySupervisorId },
      select: { name: true, departmentUnit: true },
    }),
  ]);

  const [row] = await prisma.$transaction([
    prisma.industryWeeklyComment.create({
      data: {
        placementId:          token.placementId,
        studentId:            placement.studentId,
        industrySupervisorId: token.industrySupervisorId,
        weekNumber:           token.weekNumber,
        comment:              input.comment,
        supervisorName:       supervisor.name,
        departmentUnit:       supervisor.departmentUnit,
        commentDate:          new Date(),
        origin:               'digital',
        tokenId:              token.id,
        enteredById:          null,
      },
    }),
    // Single-use: consumed atomically with the write. A concurrent second
    // submit loses on the usedAt guard and the whole tx rolls back.
    prisma.assessmentToken.update({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { weekNumber: row.weekNumber, commentDate: row.commentDate, createdAt: row.createdAt };
}

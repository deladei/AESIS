import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';
import {
  sendEmail,
  buildWeeklyCommentInviteEmail,
  buildAssessmentInviteEmail,
} from '../../shared/utils/email';
import type { Actor } from '../entries/entries.policy';

// Public magic-link landing pages (frontend routes). Purpose decides which.
const PUBLIC_PATH: Record<IssueTokenInput['purpose'], string> = {
  weekly_comment: '/weekly-comment',
  final_assessment: '/grade',
};

function publicLink(purpose: IssueTokenInput['purpose'], token: string): string {
  return `${env.FRONTEND_URL}${PUBLIC_PATH[purpose]}/${token}`;
}

// Assessment tokens: single-use, time-bound, scoped. Same hash-only guarantees
// as the attestation/grade-invite links — a DB read can never reveal a usable
// link. The final_assessment verification gate lives in a DB trigger
// (fn_assessment_token_gate); this service surfaces its rejection as a 409.

const DEFAULT_TTL_HOURS = 14 * 24; // two weeks

export function generateAssessmentToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashAssessmentToken(token) };
}

export function hashAssessmentToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const isStaff = (a: Actor) => a.role === 'admin' || a.role === 'coordinator' || a.role === 'hod';

export interface IssueTokenInput {
  purpose: 'weekly_comment' | 'final_assessment';
  weekNumber?: number;
  ttlHours?: number;
  /** Also email the link to the industry supervisor's address on record. */
  send?: boolean;
}

/**
 * Issue a token for an industry supervisor record. Staff, or the assigned
 * academic supervisor, may issue. Returns the RAW token (and its public link)
 * exactly once — neither is ever stored or logged. When `send` is set, the
 * link is also emailed to the supervisor's address on record.
 */
export async function issueAssessmentToken(actor: Actor, industrySupervisorId: string, input: IssueTokenInput) {
  const supervisor = await prisma.industrySupervisor.findUnique({
    where: { id: industrySupervisorId },
    select: {
      id: true,
      name: true,
      email: true,
      placementId: true,
      verificationStatus: true,
      placement: {
        select: {
          academicSupervisorId: true,
          student: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
      },
    },
  });
  if (!supervisor) throw new AppError(404, 'Industry supervisor not found');

  const isAssigned =
    actor.role === 'academic_supervisor' && supervisor.placement.academicSupervisorId === actor.id;
  if (!isStaff(actor) && !isAssigned) {
    throw new AppError(403, 'Not permitted to issue an assessment link for this supervisor');
  }

  if (input.purpose === 'weekly_comment' && input.weekNumber == null) {
    throw new AppError(422, 'A weekly comment link needs its week number');
  }

  // Validate deliverability BEFORE minting the token, so a send-with-no-email
  // request fails cleanly instead of leaving an orphaned single-use token.
  if (input.send && !supervisor.email) {
    throw new AppError(422, 'This supervisor has no email address on record — add one or copy the link manually');
  }

  const { token, tokenHash } = generateAssessmentToken();
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? DEFAULT_TTL_HOURS) * 3_600_000);
  const url = publicLink(input.purpose, token);

  try {
    const row = await prisma.assessmentToken.create({
      data: {
        tokenHash,
        placementId: supervisor.placementId,
        industrySupervisorId,
        purpose: input.purpose,
        weekNumber: input.weekNumber ?? null,
        expiresAt,
        createdById: actor.id,
      },
    });

    let emailedTo: string | null = null;
    if (input.send && supervisor.email) {
      const studentName = `${supervisor.placement.student.firstName} ${supervisor.placement.student.lastName}`;
      const companyName = supervisor.placement.company?.name ?? null;
      const html =
        input.purpose === 'weekly_comment'
          ? buildWeeklyCommentInviteEmail(supervisor.name, studentName, companyName, input.weekNumber!, url)
          : buildAssessmentInviteEmail(supervisor.name, studentName, companyName, url);
      const subject =
        input.purpose === 'weekly_comment'
          ? `Weekly comment for ${studentName} — week ${input.weekNumber}`
          : `Industry assessment for ${studentName}`;
      // sendEmail is fail-open (logs on failure); the token is already issued so
      // the caller can still copy the link if delivery silently fails.
      await sendEmail({ to: supervisor.email, subject, html });
      emailedTo = supervisor.email;
    }

    return { token, url, tokenId: row.id, expiresAt: row.expiresAt, emailedTo };
  } catch (err) {
    // The DB gate rejects final_assessment tokens for unverified supervisors.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('verified industry supervisor')) {
      throw new AppError(409, 'This supervisor has not been verified — verify them before sending the assessment form');
    }
    throw err;
  }
}

/**
 * Resolve a raw token for a public submit route: exists, purpose matches,
 * unexpired, unused. Marking used_at is the CALLER's job inside the same
 * transaction as the write the token authorizes (single-use guarantee).
 */
export async function resolveAssessmentToken(rawToken: string, purpose: 'weekly_comment' | 'final_assessment') {
  const row = await prisma.assessmentToken.findUnique({
    where: { tokenHash: hashAssessmentToken(rawToken) },
    include: { industrySupervisor: { select: { id: true, name: true, verificationStatus: true } } },
  });
  if (!row || row.purpose !== purpose) throw new AppError(404, 'This link is not valid');
  if (row.usedAt) throw new AppError(410, 'This link has already been used');
  if (row.expiresAt < new Date()) throw new AppError(410, 'This link has expired');
  return row;
}

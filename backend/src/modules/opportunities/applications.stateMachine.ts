import { AppError } from '../../middleware/errorHandler';
import type { ApplicationStatus } from '@prisma/client';

/**
 * Who may move an application where.
 *
 * Modelled on entry.stateMachine.ts: pure, and the ROLE guard runs before the
 * from-state guard, so an unauthorized actor gets a 403 rather than learning
 * the application's current state from a 409.
 *
 * Deliberately absent: an `interview_scheduled` stage. It needs employer
 * participation in scheduling, which this system has no identity flow for.
 * Adding it later is one `ALTER TYPE ... ADD VALUE` in its own migration.
 */
const STAFF_MOVES: Record<string, ApplicationStatus[]> = {
  pending:      ['under_review', 'rejected'],
  under_review: ['shortlisted', 'rejected'],
  shortlisted:  ['offered', 'rejected'],
  offered:      ['rejected'],
};

// Accepting an offer and withdrawing are the student's own acts, never staff's.
const STUDENT_MOVES: Record<string, ApplicationStatus[]> = {
  offered:      ['accepted', 'withdrawn'],
  pending:      ['withdrawn'],
  under_review: ['withdrawn'],
  shortlisted:  ['withdrawn'],
};

export function assertTransition(
  current: ApplicationStatus,
  next: ApplicationStatus,
  role: string,
  isOwner: boolean,
): void {
  const isStaff = ['coordinator', 'hod', 'admin'].includes(role);

  if (next === 'accepted' || next === 'withdrawn') {
    if (!isOwner) {
      throw new AppError(403, 'Only the applicant can accept or withdraw an application');
    }
    const allowed = STUDENT_MOVES[current] ?? [];
    if (!allowed.includes(next)) {
      throw new AppError(409, `An application that is ${current} cannot become ${next}`);
    }
    return;
  }

  if (!isStaff) throw new AppError(403, 'Only the coordinator can move an application');
  const allowed = STAFF_MOVES[current] ?? [];
  if (!allowed.includes(next)) {
    throw new AppError(409, `An application that is ${current} cannot become ${next}`);
  }
}

import { AppError } from '../../middleware/errorHandler';
import type { ApprovalKind } from '@prisma/client';

export interface Actor { id: string; role: string }

interface Ownership {
  studentId: string;
  academicSupervisorId: string | null;
}

const isCohortStaff = (a: Actor) => ['coordinator', 'hod', 'admin'].includes(a.role);

/**
 * Who decides a request, keyed on its kind.
 *
 * A supervisor may grant leave or approve a training plan for their own
 * student. They may NOT extend a placement, and they may NOT decide a request
 * to replace themselves — both go to the coordinator, because a decision-maker
 * must not be the subject of the decision.
 */
export function assertMayDecide(actor: Actor, kind: ApprovalKind, o: Ownership): void {
  if (actor.role === 'admin') return;

  if (kind === 'extension' || kind === 'supervisor_change') {
    if (isCohortStaff(actor)) return;
    throw new AppError(403, 'Only the coordinator can decide this request');
  }

  // leave | training_plan
  if (isCohortStaff(actor)) return;
  if (actor.role === 'academic_supervisor' && o.academicSupervisorId === actor.id) return;
  throw new AppError(403, 'You do not supervise this student');
}

/** Who may raise one: the student it is about, or staff acting for them. */
export function assertMayRequest(actor: Actor, o: Ownership): void {
  if (actor.id === o.studentId) return;
  if (isCohortStaff(actor)) return;
  if (actor.role === 'academic_supervisor' && o.academicSupervisorId === actor.id) return;
  throw new AppError(403, 'Access denied');
}

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { EntryRole } from './entry.stateMachine';

export interface Actor {
  id: string;
  role: EntryRole;
}

export type AccessMode = 'read' | 'write' | 'transition';

// The placement fields every access decision is keyed on.
export type PlacementOwnership = {
  id: string;
  studentId: string;
  academicSupervisorId: string | null;
  companySupervisorId: string | null;
};

const OWNERSHIP_SELECT = {
  id: true,
  studentId: true,
  academicSupervisorId: true,
  companySupervisorId: true,
} satisfies Prisma.PlacementSelect;

/**
 * Assert an actor may access a placement in the given mode. Throws 403/404.
 * This is the single decision point — controllers never re-implement role rules.
 */
export function assertPlacementAccess(
  actor: Actor,
  placement: PlacementOwnership,
  mode: AccessMode,
): void {
  switch (actor.role) {
    case 'admin':
      // Break-glass: always allowed, audited by the caller.
      return;

    case 'coordinator':
    case 'hod':
      // Read-only across all CS placements; never transitions or writes.
      if (mode === 'read') return;
      throw new AppError(403, 'Coordinator access to logbook entries is read-only');

    case 'student':
      // Only their own placement; writes/transitions further gated by the state machine.
      if (placement.studentId !== actor.id) throw new AppError(403, 'Access denied');
      return;

    case 'academic_supervisor':
      if (placement.academicSupervisorId !== actor.id) throw new AppError(403, 'Access denied');
      // May read and transition (acknowledge/return) but never author entry content.
      if (mode === 'write') throw new AppError(403, 'Supervisors do not author logbook content');
      return;

    case 'company_supervisor':
      // May read their assigned placements only; never a weekly-workflow actor.
      if (placement.companySupervisorId !== actor.id) throw new AppError(403, 'Access denied');
      if (mode === 'read') return;
      throw new AppError(403, 'Company supervisor cannot modify weekly entries');

    default:
      throw new AppError(403, 'Access denied');
  }
}

/** Fetch a placement and assert access in one step. */
export async function authorizePlacement(
  actor: Actor,
  placementId: string,
  mode: AccessMode,
): Promise<PlacementOwnership> {
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    select: OWNERSHIP_SELECT,
  });
  if (!placement) throw new AppError(404, 'Placement not found');
  assertPlacementAccess(actor, placement, mode);
  return placement;
}

/**
 * A Prisma `where` fragment that restricts entry queries to what `actor` may
 * see, applied at the database layer. Defense in depth: even a handler that
 * forgets an explicit ownership check cannot return another student's rows.
 */
export function entryScopeFilter(actor: Actor): Prisma.LogbookEntryWhereInput {
  switch (actor.role) {
    case 'admin':
    case 'coordinator':
    case 'hod':
      return {}; // full read scope
    case 'student':
      return { placement: { studentId: actor.id } };
    case 'academic_supervisor':
      return { placement: { academicSupervisorId: actor.id } };
    case 'company_supervisor':
      return { placement: { companySupervisorId: actor.id } };
    default:
      // Unknown role sees nothing.
      return { id: '__none__' };
  }
}

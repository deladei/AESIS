import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import type { Actor } from '../entries/entries.policy';
import type { GradeComponent } from './grades.schema';

// The placement fields every grade access decision is keyed on.
export type GradeOwnership = {
  id: string;
  studentId: string;
  academicSupervisorId: string | null;
  companySupervisorId: string | null;
  academicYearId: string;
};

const OWNERSHIP_SELECT = {
  id: true,
  studentId: true,
  academicSupervisorId: true,
  companySupervisorId: true,
  academicYearId: true,
} as const;

/** Fetch a placement's ownership fields or 404. */
export async function loadGradeOwnership(placementId: string): Promise<GradeOwnership> {
  const p = await prisma.placement.findUnique({
    where: { id: placementId },
    select: OWNERSHIP_SELECT,
  });
  if (!p) throw new AppError(404, 'Placement not found');
  return p;
}

const isOwnSupervisor = (a: Actor, o: GradeOwnership) =>
  a.role === 'academic_supervisor' && o.academicSupervisorId === a.id;

// Coordinator, HoD and admin form the grade-office staff set.
const isStaff = (a: Actor) => a.role === 'admin' || a.role === 'coordinator' || a.role === 'hod';

/** Who may READ the grade at all (the serializer further filters WHAT they see). */
export function assertCanReadGrade(actor: Actor, o: GradeOwnership): void {
  if (isStaff(actor)) return;
  if (isOwnSupervisor(actor, o)) return;
  if (actor.role === 'student' && o.studentId === actor.id) return;
  throw new AppError(403, 'Access denied');
}

/**
 * Who may enter a component's raw score. Coordinator/admin may set any component
 * (including interim industry entry until the token channel exists). The
 * assigned academic supervisor may set university/report/logbook on their own
 * placements — NEVER the industry component.
 */
export function assertCanScoreComponent(actor: Actor, o: GradeOwnership, component: GradeComponent): void {
  if (isStaff(actor)) return;
  if (isOwnSupervisor(actor, o)) {
    if (component === 'industry') {
      throw new AppError(403, 'The industry score is not entered by the academic supervisor');
    }
    return;
  }
  throw new AppError(403, 'Not permitted to score this placement');
}

/** Aggregation, override, sign-off and release are coordinator/HoD authority. */
export function assertCanManageGrade(actor: Actor): void {
  if (isStaff(actor)) return;
  throw new AppError(403, 'Only the coordinator may aggregate, override, or release a grade');
}

// The shape the serializer reads from. A subset of the Prisma FinalGrade row.
export type GradeRow = {
  industryRaw: number | null;
  universityRaw: number | null;
  reportRaw: number | null;
  logbookRaw: number | null;
  industryWeighted: number | null;
  universityWeighted: number | null;
  reportWeighted: number | null;
  logbookWeighted: number | null;
  total: number | null;
  coordinatorOverride: number | null;
  overrideReason: string | null;
  status: 'draft' | 'approved' | 'released';
  signedOffAt: Date | null;
  releasedAt: Date | null;
};

/**
 * Role-filtered grade view. THIS is the confidentiality matrix (no RLS — the
 * single enforcement point alongside the access asserts above):
 *
 *  - coordinator / admin  → everything.
 *  - academic_supervisor  → their own three components only. NEVER the industry
 *                           score, and NEVER the total (the total would let them
 *                           back-derive the hidden industry contribution).
 *  - student              → the final total ONLY, and only once released.
 *                           No component breakdown, ever.
 */
export function serializeGrade(actor: Actor, o: GradeOwnership, g: GradeRow | null) {
  const released = g?.status === 'released';
  const effectiveTotal = g ? g.coordinatorOverride ?? g.total : null;

  if (isStaff(actor)) {
    return {
      status: g?.status ?? 'draft',
      released,
      components: {
        industry: { raw: g?.industryRaw ?? null, weighted: g?.industryWeighted ?? null },
        university: { raw: g?.universityRaw ?? null, weighted: g?.universityWeighted ?? null },
        report: { raw: g?.reportRaw ?? null, weighted: g?.reportWeighted ?? null },
        logbook: { raw: g?.logbookRaw ?? null, weighted: g?.logbookWeighted ?? null },
      },
      total: g?.total ?? null,
      coordinatorOverride: g?.coordinatorOverride ?? null,
      overrideReason: g?.overrideReason ?? null,
      effectiveTotal,
      signedOffAt: g?.signedOffAt ?? null,
      releasedAt: g?.releasedAt ?? null,
    };
  }

  if (isOwnSupervisor(actor, o)) {
    // Own three components only — industry and the total are withheld.
    return {
      status: g?.status ?? 'draft',
      released,
      components: {
        university: { raw: g?.universityRaw ?? null, weighted: g?.universityWeighted ?? null },
        report: { raw: g?.reportRaw ?? null, weighted: g?.reportWeighted ?? null },
        logbook: { raw: g?.logbookRaw ?? null, weighted: g?.logbookWeighted ?? null },
      },
    };
  }

  // Student: total only, only once released.
  return {
    status: g?.status ?? 'draft',
    released,
    total: released ? effectiveTotal : null,
  };
}

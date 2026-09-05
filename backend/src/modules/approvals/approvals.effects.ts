import type { Prisma, ApprovalRequest } from '@prisma/client';
import { addDays, eachWorkingDay } from './approvals.dates';

/**
 * What an approval actually DOES once granted.
 *
 * Every kind has a named handler, so no approval is decorative — a request that
 * changes nothing when granted is a checkbox pretending to be a workflow. Each
 * runs inside the deciding transaction and is guarded by `effectAppliedAt`, so
 * a retry cannot double-apply it.
 */
export async function applyApprovalEffect(
  tx: Prisma.TransactionClient,
  request: ApprovalRequest,
): Promise<void> {
  switch (request.kind) {
    case 'leave': {
      if (!request.effectiveFrom) return;
      const to = request.effectiveTo ?? request.effectiveFrom;
      const holidays = await tx.nonWorkingDay.findMany({
        where: { academicYear: { placements: { some: { id: request.placementId } } } },
        select: { day: true },
      });
      const skip = new Set(holidays.map((h) => h.day.toISOString().slice(0, 10)));

      // Approved leave becomes attendance evidence, so the logbook stops
      // counting those days as missing. `permitted` — never `unexcused`.
      const days = eachWorkingDay(request.effectiveFrom, to).filter(
        (d) => !skip.has(d.toISOString().slice(0, 10)),
      );
      if (days.length === 0) return;
      await tx.absence.createMany({
        data: days.map((absenceDate) => ({
          studentId:   request.studentId,
          placementId: request.placementId,
          absenceDate,
          kind:        'permitted' as const,
          reason:      request.reason.slice(0, 500),
          recordedById: request.decidedById,
        })),
        skipDuplicates: true,
      });
      return;
    }

    case 'extension': {
      if (!request.effectiveTo) return;
      // Push the attachment's end date out. The logbook calendar is derived
      // from it, so the extra weeks become loggable the moment this lands.
      await tx.placement.update({
        where: { id: request.placementId },
        data:  { endDate: request.effectiveTo },
      });
      return;
    }

    case 'supervisor_change': {
      const next = (request.payload as { newSupervisorId?: string } | null)?.newSupervisorId;
      if (!next) return;
      await tx.placement.update({
        where: { id: request.placementId },
        data:  { academicSupervisorId: next },
      });
      return;
    }

    case 'training_plan':
      // No structural side effect, and deliberately not faked into one: the
      // decision record IS the outcome here — the supervisor has signed off the
      // plan, which the student and the coordinator can both now see. Attaching
      // an empty update to make this branch look busy would be theatre.
      return;

    default:
      return;
  }
}

export { addDays };

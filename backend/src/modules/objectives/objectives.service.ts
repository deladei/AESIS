import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/errorHandler';
import { assertPlacementAccess, type Actor, type PlacementOwnership } from '../entries/entries.policy';
import type { DefineObjectiveInput } from './objectives.schema';

// Learning objectives / competency mapping (BATCH 4 / feature 2).
//
// HARD RULE: only `confirmed` links count toward progress. AI may INSERT
// `suggested` links (advisory, source=ai) but they never count until a human
// confirms them — exactly mirroring how AiAssessment is advisory-only.

const OWNERSHIP_SELECT = {
  id: true,
  studentId: true,
  academicSupervisorId: true,
  companySupervisorId: true,
};

// ── authorization ─────────────────────────────────────────────

/** Academic supervisor (own placement) or admin defines objectives. */
function assertCanDefine(actor: Actor, p: PlacementOwnership): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'academic_supervisor' && p.academicSupervisorId === actor.id) return;
  throw new AppError(403, 'Only the assigned academic supervisor may define objectives for this placement');
}

/** The student authors links on their OWN entries; admin is break-glass. */
function assertCanMap(actor: Actor, p: PlacementOwnership): void {
  if (actor.role === 'admin') return;
  if (actor.role === 'student' && p.studentId === actor.id) return;
  throw new AppError(403, 'Only the student may map their own entries to objectives');
}

// ── loaders ───────────────────────────────────────────────────

async function loadPlacement(placementId: string): Promise<PlacementOwnership> {
  const p = await prisma.placement.findUnique({ where: { id: placementId }, select: OWNERSHIP_SELECT });
  if (!p) throw new AppError(404, 'Placement not found');
  return p;
}

async function loadEntryPlacement(entryId: string): Promise<{ placement: PlacementOwnership }> {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    select: { placement: { select: OWNERSHIP_SELECT } },
  });
  if (!entry) throw new AppError(404, 'Entry not found');
  return { placement: entry.placement };
}

/** Reject any objective id that is not a real objective of this placement. */
async function assertObjectivesOnPlacement(placementId: string, objectiveIds: string[]): Promise<void> {
  const unique = [...new Set(objectiveIds)];
  const found = await prisma.learningObjective.findMany({
    where: { id: { in: unique }, placementId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw new AppError(400, 'One or more objectives do not belong to this placement');
  }
}

// ── objectives (per placement) ────────────────────────────────

export async function defineObjective(actor: Actor, placementId: string, input: DefineObjectiveInput) {
  const placement = await loadPlacement(placementId);
  assertCanDefine(actor, placement);
  return prisma.learningObjective.create({
    data: { placementId, title: input.title, description: input.description ?? null, createdById: actor.id },
    select: { id: true, title: true, description: true, createdAt: true },
  });
}

/** Objectives for a placement with progress. Only CONFIRMED links count. */
export async function listObjectives(actor: Actor, placementId: string) {
  const placement = await loadPlacement(placementId);
  assertPlacementAccess(actor, placement, 'read');

  const objectives = await prisma.learningObjective.findMany({
    where: { placementId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, title: true, description: true, createdAt: true,
      entryLinks: { select: { status: true } },
    },
  });

  return objectives.map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    createdAt: o.createdAt,
    confirmedEntryCount: o.entryLinks.filter((l) => l.status === 'confirmed').length,
    suggestedEntryCount: o.entryLinks.filter((l) => l.status === 'suggested').length,
  }));
}

// ── entry <-> objective links ─────────────────────────────────

export async function listEntryObjectives(actor: Actor, entryId: string) {
  const { placement } = await loadEntryPlacement(entryId);
  assertPlacementAccess(actor, placement, 'read');
  return prisma.entryObjective.findMany({
    where: { entryId },
    orderBy: { createdAt: 'asc' },
    select: {
      objectiveId: true, status: true, source: true, confirmedAt: true,
      objective: { select: { id: true, title: true } },
    },
  });
}

/** Student maps their own entry to objectives — human, confirmed immediately. */
export async function addEntryObjectives(actor: Actor, entryId: string, objectiveIds: string[]) {
  const { placement } = await loadEntryPlacement(entryId);
  assertCanMap(actor, placement);
  const ids = [...new Set(objectiveIds)];
  await assertObjectivesOnPlacement(placement.id, ids);

  // Upsert each as confirmed. Promoting a prior AI suggestion keeps source=ai
  // (provenance), only flipping it to confirmed.
  await prisma.$transaction(
    ids.map((objectiveId) =>
      prisma.entryObjective.upsert({
        where: { entryId_objectiveId: { entryId, objectiveId } },
        create: {
          entryId, objectiveId, status: 'confirmed', source: 'human',
          confirmedById: actor.id, confirmedAt: new Date(),
        },
        update: { status: 'confirmed', confirmedById: actor.id, confirmedAt: new Date() },
      }),
    ),
  );
  return listEntryObjectives(actor, entryId);
}

/**
 * AI enrichment path: INSERT advisory `suggested` links only. Never overrides an
 * existing link (a human-confirmed mapping is untouched). Admin-only — the
 * enrichment service authenticates as the system; a human never "suggests".
 */
export async function suggestEntryObjectives(actor: Actor, entryId: string, objectiveIds: string[]) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'AI objective suggestions are written by the system only');
  }
  const { placement } = await loadEntryPlacement(entryId);
  const ids = [...new Set(objectiveIds)];
  await assertObjectivesOnPlacement(placement.id, ids);

  const existing = await prisma.entryObjective.findMany({
    where: { entryId, objectiveId: { in: ids } },
    select: { objectiveId: true },
  });
  const have = new Set(existing.map((e) => e.objectiveId));
  const toCreate = ids.filter((id) => !have.has(id));
  if (toCreate.length > 0) {
    await prisma.entryObjective.createMany({
      data: toCreate.map((objectiveId) => ({ entryId, objectiveId, status: 'suggested' as const, source: 'ai' as const })),
    });
  }
  return listEntryObjectives(actor, entryId);
}

/** Human confirms an AI suggestion — only now does it count. Student own / admin. */
export async function confirmEntryObjective(actor: Actor, entryId: string, objectiveId: string) {
  const { placement } = await loadEntryPlacement(entryId);
  assertCanMap(actor, placement);

  const link = await prisma.entryObjective.findUnique({
    where: { entryId_objectiveId: { entryId, objectiveId } },
    select: { id: true, status: true },
  });
  if (!link) throw new AppError(404, 'Objective link not found');
  if (link.status === 'confirmed') {
    return prisma.entryObjective.findUniqueOrThrow({ where: { id: link.id } });
  }
  return prisma.entryObjective.update({
    where: { id: link.id },
    data: { status: 'confirmed', confirmedById: actor.id, confirmedAt: new Date() },
  });
}

/** Remove an entry<->objective link. Student own / admin. */
export async function removeEntryObjective(actor: Actor, entryId: string, objectiveId: string) {
  const { placement } = await loadEntryPlacement(entryId);
  assertCanMap(actor, placement);
  await prisma.entryObjective.deleteMany({ where: { entryId, objectiveId } });
  return { removed: true };
}

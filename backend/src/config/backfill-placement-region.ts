/**
 * One-off backfill: set `region` on legacy placements created before the
 * placement.region column existed (S57/S58).
 *
 * Source of truth: an academic supervisor is assigned to exactly one region and
 * supervises every intern placed there (see schema.prisma — Region). So a
 * placement with a null region whose assigned academic supervisor HAS a
 * `supervisedRegion` can safely inherit it. Placements with no assigned
 * supervisor, or whose supervisor has no region set, are left null and reported
 * — those need a coordinator decision, not a guess.
 *
 * Idempotent — only touches rows where region IS NULL. Safe to re-run.
 *
 *   npm run db:backfill-region          # dry run (default) — reports only
 *   BACKFILL_APPLY=1 npm run db:backfill-region   # actually writes
 *
 * Run against prod by pointing DATABASE_URL at Neon in the environment.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const APPLY = process.env.BACKFILL_APPLY === '1';

async function backfill() {
  console.log(`🔧 Backfilling placement.region (${APPLY ? 'APPLY' : 'dry run'})...`);

  const orphans = await prisma.placement.findMany({
    where: { region: null },
    select: {
      id: true,
      academicSupervisorId: true,
      academicSupervisor: { select: { supervisedRegion: true } },
    },
  });

  if (orphans.length === 0) {
    console.log('✓ No placements with a null region — nothing to do.');
    return;
  }

  const derivable = orphans.filter((p) => p.academicSupervisor?.supervisedRegion);
  const unresolved = orphans.filter((p) => !p.academicSupervisor?.supervisedRegion);

  for (const p of derivable) {
    const region = p.academicSupervisor!.supervisedRegion!;
    if (APPLY) {
      await prisma.placement.update({ where: { id: p.id }, data: { region } });
    }
    console.log(`  • placement ${p.id} → ${region}${APPLY ? '' : ' (would set)'}`);
  }

  console.log(
    `\n✓ ${APPLY ? 'Set' : 'Would set'} region on ${derivable.length} placement(s) from the assigned supervisor.`,
  );
  if (unresolved.length > 0) {
    console.log(
      `⚠ ${unresolved.length} placement(s) left null — no assigned supervisor or supervisor has no region. ` +
        'Assign a regional supervisor (or set the region manually) for these:',
    );
    for (const p of unresolved) {
      console.log(`  • placement ${p.id}${p.academicSupervisorId ? ' (supervisor has no region)' : ' (unassigned)'}`);
    }
  }
  if (!APPLY) console.log('\nDry run — re-run with BACKFILL_APPLY=1 to write the changes.');
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

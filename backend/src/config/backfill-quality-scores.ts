/**
 * One-off backfill: sanitise already-corrupted quality scores.
 *
 * Before the ingestion guard (ai/tasks/analysis_tasks.py) and the validated
 * aggregation (shared/utils/quality.ts) landed, an out-of-range value could be
 * written to logbook_analyses.quality_score and would poison every dashboard
 * average derived from it. This clamps any stored score outside [0, 100] back
 * into range so recomputed averages are correct. Idempotent — safe to re-run.
 *
 *   npm run db:backfill-quality
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const QUALITY_MIN = 0;
const QUALITY_MAX = 100;

async function backfill() {
  console.log('🔧 Backfilling out-of-range quality scores...');

  const corrupt = await prisma.logbookAnalysis.findMany({
    where: {
      OR: [
        { qualityScore: { lt: QUALITY_MIN } },
        { qualityScore: { gt: QUALITY_MAX } },
      ],
    },
    select: { id: true, submissionId: true, qualityScore: true },
  });

  if (corrupt.length === 0) {
    console.log('✓ No out-of-range quality scores found — nothing to do.');
    return;
  }

  for (const row of corrupt) {
    const raw = Number(row.qualityScore);
    const clamped = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, raw));
    await prisma.logbookAnalysis.update({
      where: { id: row.id },
      data:  { qualityScore: clamped },
    });
    console.log(
      `  • submission ${row.submissionId}: ${row.qualityScore?.toString()} → ${clamped}`,
    );
  }

  console.log(`✓ Clamped ${corrupt.length} corrupted quality score(s).`);
}

backfill()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

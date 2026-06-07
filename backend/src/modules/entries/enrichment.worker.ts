import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import {
  enrichEntryViaFastApi,
  type EnrichFn,
  type EnrichmentPayload,
} from './enrichment.client';

/**
 * Path 2 — AI enrichment worker (fail-open).
 *
 * The queue is a plain Postgres table (enrichment_queue); this is the polling
 * consumer. No message broker (per spec). Guarantees:
 *  - It NEVER blocks or fails the write/review paths — a failed assessment just
 *    leaves the entry fully reviewable with no ai_assessment row.
 *  - It NEVER writes to logbook_entry.status or any grade — advisory only.
 *  - Each job is claimed atomically (FOR UPDATE SKIP LOCKED) so multiple workers
 *    or overlapping ticks can't double-process.
 *  - Transient failures retry with exponential backoff; after maxAttempts the
 *    job is 'abandoned' (we give up) — never an infinite retry.
 */

const BATCH_SIZE = 10;
const BASE_BACKOFF_MS = 30_000; // 30s, doubling per attempt
const MAX_BACKOFF_MS = 60 * 60_000; // cap at 1h
// A job stuck in 'processing' past this (worker crashed mid-flight) is reclaimed.
const STALE_PROCESSING_MS = 5 * 60_000;

interface ClaimedJob {
  id: string;
  entry_id: string;
  attempts: number;
  max_attempts: number;
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

// Prisma stores DateTime in our `timestamp` (no-tz) columns as UTC wall-clock,
// but the DB session timezone is not guaranteed to be UTC. Comparing those
// columns against Postgres now() would be off by the session offset, so we bind
// app time as a UTC-naive string cast to ::timestamp — a session-tz-independent
// comparison that matches exactly how Prisma reads/writes these columns.
function pgUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Atomically claim the next due job: mark it 'processing', stamp locked_at, and
 * increment attempts — all in one statement so concurrent claimers never collide.
 * Picks up pending/failed jobs whose backoff has elapsed, plus any 'processing'
 * job whose lock is stale (previous worker died).
 */
async function claimNext(): Promise<ClaimedJob | null> {
  const now = pgUtc(new Date());
  const staleCutoff = pgUtc(new Date(Date.now() - STALE_PROCESSING_MS));
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE enrichment_queue q
    SET status = 'processing', locked_at = ${now}::timestamp, attempts = attempts + 1,
        updated_at = ${now}::timestamp
    WHERE q.id = (
      SELECT id FROM enrichment_queue
      WHERE (status IN ('pending', 'failed') AND next_run_at <= ${now}::timestamp)
         OR (status = 'processing' AND locked_at < ${staleCutoff}::timestamp)
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING q.id, q.entry_id, q.attempts, q.max_attempts
  `;
  return rows[0] ?? null;
}

async function buildPayload(entryId: string): Promise<EnrichmentPayload | null> {
  const entry = await prisma.logbookEntry.findUnique({
    where: { id: entryId },
    include: { activities: { orderBy: { activityDate: 'asc' } }, reflection: true },
  });
  if (!entry) return null;

  return {
    entry_id: entry.id,
    week_number: entry.weekNumber,
    activities: entry.activities.map((a) => ({
      description: a.description,
      competency_tags: a.competencyTags,
      activity_date: a.activityDate.toISOString().slice(0, 10),
    })),
    reflection: entry.reflection
      ? { learning: entry.reflection.learning, challenges: entry.reflection.challenges }
      : null,
  };
}

async function onSuccess(job: ClaimedJob, payload: EnrichmentPayload, result: Awaited<ReturnType<EnrichFn>>) {
  // Persist the assessment and close the job in one transaction. Note: we touch
  // ai_assessment + enrichment_queue ONLY — never logbook_entry.
  await prisma.$transaction([
    prisma.aiAssessment.create({
      data: {
        entryId: payload.entry_id,
        modelName: result.model_name,
        relevance: result.relevance,
        summary: result.summary as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.enrichmentQueue.update({
      where: { id: job.id },
      data: { status: 'succeeded', lockedAt: null, lastError: null },
    }),
  ]);
}

async function onFailure(job: ClaimedJob, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const givingUp = job.attempts >= job.max_attempts;

  await prisma.enrichmentQueue.update({
    where: { id: job.id },
    data: givingUp
      ? { status: 'abandoned', lockedAt: null, lastError: message }
      : {
          status: 'failed',
          lockedAt: null,
          lastError: message,
          nextRunAt: new Date(Date.now() + backoffMs(job.attempts)),
        },
  });

  logger.warn('enrichment job failed (fail-open; entry remains reviewable)', {
    jobId: job.id,
    entryId: job.entry_id,
    attempt: job.attempts,
    givingUp,
    error: message,
  });
}

/**
 * Process a single claimed job. Returns true if a job was handled, false if the
 * queue was empty. Crucially: a thrown enrich() — down/slow FastAPI, bad JSON —
 * is caught here and converted to a retry/abandon; it never escapes.
 */
export async function processOne(enrich: EnrichFn = enrichEntryViaFastApi): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;

  try {
    const payload = await buildPayload(job.entry_id);
    if (!payload) {
      // Entry vanished — nothing to assess; close the job, don't retry forever.
      await prisma.enrichmentQueue.update({
        where: { id: job.id },
        data: { status: 'abandoned', lockedAt: null, lastError: 'entry no longer exists' },
      });
      return true;
    }
    const result = await enrich(payload);
    await onSuccess(job, payload, result);
  } catch (err) {
    await onFailure(job, err);
  }
  return true;
}

/** Drain up to BATCH_SIZE due jobs. Returns how many were processed. */
export async function runEnrichmentOnce(enrich: EnrichFn = enrichEntryViaFastApi): Promise<number> {
  let processed = 0;
  for (let i = 0; i < BATCH_SIZE; i++) {
    const handled = await processOne(enrich);
    if (!handled) break;
    processed++;
  }
  return processed;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Start the background polling loop. Safe to call once at server boot. */
export function startEnrichmentWorker(intervalMs = 15_000): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      await runEnrichmentOnce();
    } catch (err) {
      // Defensive: the loop itself must survive anything.
      logger.error('enrichment worker tick crashed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.(); // don't keep the process alive for the timer alone
  logger.info('Enrichment worker started', { intervalMs });
}

export function stopEnrichmentWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

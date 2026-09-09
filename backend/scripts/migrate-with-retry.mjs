#!/usr/bin/env node
/**
 * `prisma migrate deploy`, retried, because the failure it hits is temporary.
 *
 * WHY THIS EXISTS
 * ---------------
 * Supabase's session-mode pooler allows 15 clients across every consumer of the
 * database. During a deploy that budget is at its tightest: the OLD instance is
 * still serving (Render keeps it up until the new one is healthy) and holding
 * its Prisma pool, the AI engine is holding its asyncpg pool, and the new
 * instance's migration needs one connection before it is allowed to start.
 *
 * When it cannot get one, Supavisor answers:
 *
 *     FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * `migrate deploy` exits 1, the deploy fails, the old instance keeps its
 * connections, and the next attempt meets the same wall — a restart loop that
 * cannot end on its own, from a condition that would clear in seconds.
 *
 * Bounded pools (backend `connection_limit`, engine `max_size`) are the actual
 * fix. This is the safety net: a migration refused a connection is worth
 * waiting for, not worth failing a deploy over.
 *
 * Anything else — a genuinely bad migration, a P3009 failed row — is NOT
 * retried. Those need a human and the RUNBOOK, and hammering them wastes
 * minutes before the deploy fails anyway.
 */
import { spawnSync } from 'node:child_process';

const BACKOFFS_MS = [5_000, 10_000, 20_000, 30_000, 30_000];

/** Errors that mean "no connection right now", as opposed to "this is broken". */
const TRANSIENT = [
  'max clients reached',
  'EMAXCONNSESSION',
  'too many connections',
  'Timed out fetching a new connection',
  "Can't reach database server",
  'Connection refused',
  'ETIMEDOUT',
  'ECONNRESET',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 0; ; attempt++) {
  const run = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    encoding: 'utf8',
    env: process.env,
  });

  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  process.stdout.write(output);

  if (run.status === 0) {
    process.exit(0);
  }

  const transient = TRANSIENT.some((needle) => output.includes(needle));
  if (!transient) {
    console.error('migrate: failed for a reason retrying will not fix — see RUNBOOK.md');
    process.exit(run.status ?? 1);
  }

  if (attempt >= BACKOFFS_MS.length) {
    console.error(`migrate: still could not get a connection after ${attempt + 1} attempts`);
    process.exit(run.status ?? 1);
  }

  const wait = BACKOFFS_MS[attempt];
  console.error(`migrate: no connection available; retrying in ${wait / 1000}s`);
  await sleep(wait);
}

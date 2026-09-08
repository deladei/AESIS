#!/usr/bin/env node
/**
 * Bring the integration-test database in line with `prisma/schema.prisma`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The six `*.integration.test.ts` suites do not use the `DATABASE_URL` in
 * `.env`. They rewrite it before importing Prisma:
 *
 *     base.hostname = '127.0.0.1';
 *     base.pathname = '/aesis_logbook_test';
 *
 * Nothing keeps that database current. No script, no hook, no step in `npm
 * test`; it carries a `_prisma_migrations` table but nothing writes to it, and
 * the `.env` database next door has no baseline at all, so `prisma migrate
 * deploy` there refuses with P3005. The result is a trap: the suites stay green
 * until a schema change lands, then all six fail at once on
 * `column ... does not exist`, which reads exactly like a code break and is
 * not. That cost an hour on 2026-09-08 and would cost it again on the next
 * column.
 *
 * WHY `db push` AND NOT `migrate deploy`
 * --------------------------------------
 * A test database has no history worth preserving — every suite builds and
 * tears down its own rows. `db push` makes the schema match in one step and
 * needs no baseline. That is the right tool HERE and the wrong tool in
 * production: `db push --accept-data-loss` against production is what froze
 * migrations from S57 to S61.
 *
 * Which is why the guards below matter more than the sync does.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDir, '.env') });

/** Must match the rewrite the integration suites perform. */
const TEST_DB_NAME = 'aesis_logbook_test';
const LOCAL_HOSTS  = new Set(['127.0.0.1', 'localhost', '::1']);

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL is not set — is backend/.env present?');
  process.exit(1);
}

let url;
try {
  url = new URL(raw.trim());
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(1);
}

// Derived exactly the way the suites derive it, so the two cannot drift.
url.hostname = '127.0.0.1';
url.pathname = `/${TEST_DB_NAME}`;

// ── Guards ────────────────────────────────────────────────────────────────
// `db push` can drop columns. These make it impossible to point this script at
// anything but the local throwaway database, whatever is in .env at the time.
if (url.pathname !== `/${TEST_DB_NAME}`) {
  console.error(`Refusing to run: target database is not ${TEST_DB_NAME}.`);
  process.exit(1);
}
if (!LOCAL_HOSTS.has(url.hostname)) {
  console.error(`Refusing to run: ${url.hostname} is not a local host.`);
  process.exit(1);
}
// Belt and braces — a managed host must never be reachable from here even if
// the two checks above were somehow edited into agreement.
if (/supabase|neon\.tech|render\.com|amazonaws|azure|googleapis/i.test(raw)) {
  console.error('Refusing to run: DATABASE_URL points at a managed database.');
  process.exit(1);
}

// Never printed with credentials.
console.log(`Syncing ${url.hostname}:${url.port || 5432}/${TEST_DB_NAME} to prisma/schema.prisma`);

// Does the database already exist? Ask it directly, rather than asking the
// `postgres` database about it — the application role often cannot connect
// there at all, and making that a prerequisite turned "already fine" into a
// hard failure. Creation is the rare path, so it pays the cost, not the
// common one.
const { PrismaClient } = await import('@prisma/client');

async function reachable(target) {
  const probe = new PrismaClient({ datasources: { db: { url: target } } });
  try {
    await probe.$queryRawUnsafe('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}

if (!(await reachable(url.toString()))) {
  console.log(`${TEST_DB_NAME} is not reachable — trying to create it.`);
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    // Identifier is a module constant, never user input.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
    console.log(`Created database ${TEST_DB_NAME}.`);
  } catch (err) {
    console.error(`Could not create ${TEST_DB_NAME}.`);
    console.error(err instanceof Error ? err.message.split('\n')[0] : err);
    console.error(`\nCreate it once by hand, then re-run this:\n`
      + `  createdb -h ${url.hostname} -p ${url.port || 5432} ${TEST_DB_NAME}`);
    process.exit(1);
  } finally {
    await admin.$disconnect().catch(() => {});
  }
}

try {
  execFileSync(
    'npx',
    ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss',
     '--schema', path.join(backendDir, 'prisma', 'schema.prisma')],
    { cwd: backendDir, stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.toString() } },
  );
} catch (err) {
  // Prisma's own output has already been inherited above; this only says which
  // step failed, because a bare exit here reads as "nothing happened".
  console.error('\nprisma db push failed — the test database was NOT changed.');
  console.error(err instanceof Error ? err.message.split('\n')[0] : err);
  process.exit(1);
}

console.log('Test database is in sync. The integration suites can run.');

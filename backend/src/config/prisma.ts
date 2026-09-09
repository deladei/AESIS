import { PrismaClient } from '@prisma/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma's default pool is `cpus * 2 + 1` connections, which is a fine default
// against a database of your own and far too many against Supabase's
// session-mode pooler: that pool is 15 clients TOTAL, shared with the AI engine
// and — during a deploy, while the old instance is still serving — with the
// previous copy of this process and the `prisma migrate deploy` that gates the
// new one's start.
//
// Unbounded, the dashboards were the first to feel it: they fan out ~20 queries
// in one Promise.all, Prisma opened a socket per query, and Supavisor answered
// `max clients reached in session mode`, which surfaced as a 500 on a page that
// worked perfectly against any database with room in it. The same exhaustion
// then failed `migrate deploy` at boot and put the service in a restart loop.
//
// Bounded, the burst queues in Prisma instead of hammering the pooler. Four
// leaves room for the engine, the migration and the deploy overlap. Only in
// production, and only when the URL does not already say otherwise.
const POOL_LIMIT = 4;
const POOL_TIMEOUT_SECONDS = 30;

/**
 * Append the pool settings. Do NOT parse and re-serialise the DSN to do it:
 * `new URL(dsn).toString()` re-encodes the credentials, and a password that
 * survives Prisma's own parser does not necessarily survive that round trip —
 * which is how this arrived in production as a PrismaClientInitializationError
 * on a URL that had worked for months. The string is the user's; only add to
 * the end of it.
 */
function boundedUrl(raw: string): string {
  if (env.NODE_ENV !== 'production') return raw;
  const params: string[] = [];
  if (!/[?&]connection_limit=/.test(raw)) params.push(`connection_limit=${POOL_LIMIT}`);
  if (!/[?&]pool_timeout=/.test(raw))     params.push(`pool_timeout=${POOL_TIMEOUT_SECONDS}`);
  if (params.length === 0) return raw;
  return `${raw}${raw.includes('?') ? '&' : '?'}${params.join('&')}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
    datasources: { db: { url: boundedUrl(env.DATABASE_URL) } },
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}

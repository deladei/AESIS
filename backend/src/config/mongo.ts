import { MongoClient, Db } from 'mongodb';
import { env } from './env';
import { logger } from './logger';

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<Db | null> {
  if (db) return db;

  try {
    client = new MongoClient(env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db();
    logger.info('MongoDB connected');
    return db;
  } catch (err) {
    logger.warn('MongoDB unavailable — logbook document store disabled', { err });
    return null;
  }
}

export function getMongo(): Db | null {
  return db ?? null;
}

export async function disconnectMongo() {
  if (client) await client.close();
}

// Collection name constants
export const COLLECTIONS = {
  LOGBOOK_ENTRIES:  'logbook_entries',
  CHAT_SESSIONS:    'chat_sessions',
} as const;

/**
 * Where this service thinks its document store lives, and what looks wrong.
 *
 * `MONGO_URI` is `sync: false` on BOTH this service and the AI engine
 * (render.yaml:33 and :144), so the two are typed into a dashboard separately
 * and drift apart — which is exactly how the engine ended up unable to save a
 * single chat transcript while nothing here complained. Comparing this against
 * the engine's `/health` is how you see which of the two is stale.
 *
 * Publishes the host suffix and the database name, never any part of the
 * credential. Mirrors `mongo_target()` in ai/config/database.py.
 */
export function mongoTarget(): {
  configured: boolean; host?: string; database?: string;
  hasPassword?: boolean; connected: boolean; problem?: string;
} {
  const raw = env.MONGO_URI ?? '';
  const connected = db != null;

  if (raw.trim() === '') return { configured: false, connected, problem: 'MONGO_URI is empty' };

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { configured: true, connected, problem: 'MONGO_URI is not a parseable URI' };
  }

  const database = parsed.pathname.replace(/^\//, '').split('?')[0];

  let problem: string | undefined;
  if (raw !== raw.trim()) {
    // A paste that carried a newline. Mongo reports it as an auth failure,
    // which sends everyone looking at the password instead.
    problem = 'MONGO_URI has leading or trailing whitespace';
  } else if (!database) {
    problem = 'MONGO_URI names no database (add /<dbname> before the ?)';
  } else if (!parsed.password) {
    problem = 'MONGO_URI carries no password';
  }

  const host = parsed.hostname;
  return {
    configured: true,
    host: host.split('.').slice(-2).join('.') || host,
    database: database || '(none)',
    hasPassword: parsed.password !== '',
    connected,
    problem,
  };
}

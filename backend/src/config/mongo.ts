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

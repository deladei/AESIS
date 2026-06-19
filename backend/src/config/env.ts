import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Safe env boolean: z.coerce.boolean() treats any non-empty string ("false")
// as true. Accept only explicit true/false/1/0; fall back to `def`.
const envBool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const envSchema = z.object({
  NODE_ENV:                  z.enum(['development', 'test', 'production']).default('development'),
  PORT:                      z.coerce.number().default(3000),

  // Connection strings are .trim()'d: a stray space/newline in a hosting
  // dashboard env var otherwise breaks scheme detection — for REDIS_URL it made
  // ioredis connect plaintext to Upstash's TLS port → endless ECONNRESET/EPIPE
  // reconnect storm (never reaching 'ready'). Trim at the boundary so every
  // consumer (ioredis, Prisma, Mongo) gets the clean value.
  DATABASE_URL:              z.string().trim().min(1),
  MONGO_URI:                 z.string().trim().min(1),
  REDIS_URL:                 z.string().trim().min(1),

  JWT_SECRET:                z.string().min(32),
  JWT_EXPIRY:                z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().default(7),
  BCRYPT_ROUNDS:             z.coerce.number().default(12),

  ENCRYPTION_KEY:            z.string().length(64, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  AI_ENGINE_URL:             z.string().url().default('http://localhost:8000'),
  AI_ENGINE_API_KEY:         z.string().min(1),

  SENDGRID_API_KEY:          z.string().optional(),
  EMAIL_FROM:                z.string().email().default('noreply@aesis.cs.edu'),
  EMAIL_FROM_NAME:           z.string().default('AESIS System'),

  AWS_BUCKET:                z.string().optional(),
  AWS_REGION:                z.string().optional(),
  AWS_ACCESS_KEY_ID:         z.string().optional(),
  AWS_SECRET_ACCESS_KEY:     z.string().optional(),

  // Cloudinary — object storage for logbook entry attachments. Optional so dev
  // and test boot without it; the upload route returns 503 when unconfigured
  // (see config/cloudinary.ts → isCloudinaryConfigured). Trimmed at the
  // boundary like the other connection secrets.
  CLOUDINARY_CLOUD_NAME:     z.string().trim().optional(),
  CLOUDINARY_API_KEY:        z.string().trim().optional(),
  CLOUDINARY_API_SECRET:     z.string().trim().optional(),

  FRONTEND_URL:              z.string().url().default('http://localhost:5173'),

  SENTRY_DSN:                z.string().optional(),

  // ── Weekly logbook pipeline config flags ─────────────────────
  // These two depend on the university's attachment regulations, which are
  // unconfirmed. They default to the assumptions documented in the module
  // README; flip via env when the regulations are known.
  WEEKLY_BINDING_GRADES:                          envBool(false),
  COMPANY_ATTESTATION_REQUIRED_FOR_FINALIZATION:  envBool(false),
  // ── Coordinator feature flags ────────────────────────────────
  // AI candidate–role "Pulse Matching" is roadmap-only. Off in production until
  // a real matching service exists; while off the panel renders disabled.
  AI_PULSE_MATCHING:                              envBool(false),
  // AI Insights & Analytics surface. A working page; on by default but
  // feature-flagged so it can be hidden from the coordinator nav per cohort.
  AI_INSIGHTS:                                    envBool(true),
  // Backfill cutoff: reject weekly submissions more than N days after the
  // period ends. Unset = OFF (default). Set a number to enable.
  BACKFILL_CUTOFF_DAYS:                           z.coerce.number().int().nonnegative().optional(),
  // Company attestation magic-link lifetime.
  ATTESTATION_TOKEN_TTL_HOURS:                    z.coerce.number().int().positive().default(168),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

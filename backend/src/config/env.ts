import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV:                  z.enum(['development', 'test', 'production']).default('development'),
  PORT:                      z.coerce.number().default(3000),

  DATABASE_URL:              z.string().min(1),
  MONGO_URI:                 z.string().min(1),
  REDIS_URL:                 z.string().min(1),

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

  FRONTEND_URL:              z.string().url().default('http://localhost:5173'),

  SENTRY_DSN:                z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

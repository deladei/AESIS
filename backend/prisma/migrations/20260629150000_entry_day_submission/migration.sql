-- Per-day submission state within a week (the day is the submittable unit;
-- the week stays the review/grade unit). Additive only — no existing data is
-- touched. Guarded so a replay (or a prod that already saw it via db push) is
-- safe.

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DayStatus" AS ENUM ('draft', 'submitted');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "entry_days" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DayStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "logged_late" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "entry_days_entry_id_date_key" ON "entry_days"("entry_id", "date");
CREATE INDEX IF NOT EXISTS "entry_days_entry_id_idx" ON "entry_days"("entry_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "entry_days" ADD CONSTRAINT "entry_days_entry_id_fkey"
    FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

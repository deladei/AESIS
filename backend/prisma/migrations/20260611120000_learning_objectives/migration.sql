-- Learning objectives / competency mapping (BATCH 4 / feature 2).
--
-- Fully additive: two new enums and two new tables. No existing table, column,
-- or row is altered. AI-suggested links are stored as `suggested` and never
-- count toward progress until a human confirms them.

-- 1. Link state + provenance enums.
CREATE TYPE "ObjectiveLinkStatus" AS ENUM ('suggested', 'confirmed');
CREATE TYPE "ObjectiveLinkSource" AS ENUM ('human', 'ai');

-- 2. Objectives defined per placement.
CREATE TABLE "learning_objective" (
  "id"            TEXT NOT NULL,
  "placement_id"  TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "learning_objective_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_objective_placement_id_idx" ON "learning_objective"("placement_id");

ALTER TABLE "learning_objective"
  ADD CONSTRAINT "learning_objective_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_objective"
  ADD CONSTRAINT "learning_objective_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Entry <-> objective links.
CREATE TABLE "entry_objective" (
  "id"              TEXT NOT NULL,
  "entry_id"        TEXT NOT NULL,
  "objective_id"    TEXT NOT NULL,
  "status"          "ObjectiveLinkStatus" NOT NULL DEFAULT 'confirmed',
  "source"          "ObjectiveLinkSource" NOT NULL DEFAULT 'human',
  "confirmed_by_id" TEXT,
  "confirmed_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_objective_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "entry_objective_entry_id_objective_id_key" ON "entry_objective"("entry_id", "objective_id");
CREATE INDEX "entry_objective_objective_id_idx" ON "entry_objective"("objective_id");
CREATE INDEX "entry_objective_entry_id_idx" ON "entry_objective"("entry_id");

ALTER TABLE "entry_objective"
  ADD CONSTRAINT "entry_objective_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entry_objective"
  ADD CONSTRAINT "entry_objective_objective_id_fkey"
  FOREIGN KEY ("objective_id") REFERENCES "learning_objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entry_objective"
  ADD CONSTRAINT "entry_objective_confirmed_by_id_fkey"
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

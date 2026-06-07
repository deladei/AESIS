-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('draft', 'submitted', 'returned', 'acknowledged');

-- CreateEnum
CREATE TYPE "FinalizationStatus" AS ENUM ('active', 'assessment_pending', 'finalized');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'abandoned');

-- AlterTable
ALTER TABLE "placements" ADD COLUMN     "finalization_status" "FinalizationStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "logbook_entry" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'draft',
    "hours_logged" DECIMAL(5,2),
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_activity" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "activity_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "competency_tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_reflection" (
    "entry_id" TEXT NOT NULL,
    "learning" TEXT NOT NULL,
    "challenges" TEXT NOT NULL,
    "supervisor_visible" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_reflection_pkey" PRIMARY KEY ("entry_id")
);

-- CreateTable
CREATE TABLE "entry_event" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "from_status" "EntryStatus",
    "to_status" "EntryStatus" NOT NULL,
    "comment" TEXT,
    "score" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assessment" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "relevance" DECIMAL(4,3),
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_assessment" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "academic_supervisor_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "narrative" TEXT,
    "cross_week_summary" JSONB,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placement_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_attestation" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "magic_link_token_hash" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "attested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_attestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_queue" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrichment_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logbook_entry_placement_id_idx" ON "logbook_entry"("placement_id");

-- CreateIndex
CREATE INDEX "logbook_entry_status_idx" ON "logbook_entry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "logbook_entry_placement_id_week_number_key" ON "logbook_entry"("placement_id", "week_number");

-- CreateIndex
CREATE INDEX "entry_activity_entry_id_idx" ON "entry_activity"("entry_id");

-- CreateIndex
CREATE INDEX "entry_event_entry_id_idx" ON "entry_event"("entry_id");

-- CreateIndex
CREATE INDEX "ai_assessment_entry_id_idx" ON "ai_assessment"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "placement_assessment_placement_id_key" ON "placement_assessment"("placement_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_attestation_placement_id_key" ON "company_attestation"("placement_id");

-- CreateIndex
CREATE INDEX "enrichment_queue_status_next_run_at_idx" ON "enrichment_queue"("status", "next_run_at");

-- AddForeignKey
ALTER TABLE "logbook_entry" ADD CONSTRAINT "logbook_entry_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_activity" ADD CONSTRAINT "entry_activity_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_reflection" ADD CONSTRAINT "entry_reflection_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_event" ADD CONSTRAINT "entry_event_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_event" ADD CONSTRAINT "entry_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assessment" ADD CONSTRAINT "ai_assessment_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_assessment" ADD CONSTRAINT "placement_assessment_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_assessment" ADD CONSTRAINT "placement_assessment_academic_supervisor_id_fkey" FOREIGN KEY ("academic_supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_attestation" ADD CONSTRAINT "company_attestation_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_queue" ADD CONSTRAINT "enrichment_queue_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────
-- Append-only enforcement for entry_event.
-- The event log is the audit spine of the state machine: rows are only
-- ever INSERTed. UPDATE/DELETE are rejected at the database layer so an
-- application bug (or a compromised app credential) cannot rewrite history.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION entry_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'entry_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entry_event_no_update
  BEFORE UPDATE ON "entry_event"
  FOR EACH ROW EXECUTE FUNCTION entry_event_append_only();

CREATE TRIGGER entry_event_no_delete
  BEFORE DELETE ON "entry_event"
  FOR EACH ROW EXECUTE FUNCTION entry_event_append_only();

-- Change of attachment. The logbook rule: a student starts and finishes at one
-- establishment; a change needs the university's written permission IN ADVANCE
-- (authorization letter), else the attachment is cancelled. An approved
-- transfer closes the old placement as transferred_out (its weeks still count)
-- and opens a successor placement; the attachment is continuous — week
-- numbering never resets. A cancelled placement's weeks do NOT count.

ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'transferred_out';
ALTER TYPE "PlacementStatus" ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TYPE "TransferStatus" AS ENUM ('requested', 'approved', 'rejected');

ALTER TABLE "placements" ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "placements" ADD COLUMN "supersedes_placement_id" TEXT;

ALTER TABLE "placements" ADD CONSTRAINT "placements_supersedes_placement_id_fkey"
  FOREIGN KEY ("supersedes_placement_id") REFERENCES "placements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: only a live (pending/active) placement is "current". Historical
-- rejected/withdrawn/failed/completed rows are not.
UPDATE "placements" SET "is_current" = false
  WHERE "placement_status" NOT IN ('pending', 'active');

-- Data predating the one-live-placement app guard can hold two live rows for
-- one student; keep only the newest (created_at, id tiebreak) as current.
UPDATE "placements" p SET "is_current" = false
  WHERE p."is_current"
    AND EXISTS (
      SELECT 1 FROM "placements" q
      WHERE q."student_id" = p."student_id"
        AND q."is_current"
        AND (q."created_at" > p."created_at"
             OR (q."created_at" = p."created_at" AND q."id" > p."id"))
    );

-- Exactly ONE current placement per student. Prisma cannot model a partial
-- unique index — this is the enforcement the schema comment points at.
CREATE UNIQUE INDEX "placements_one_current_per_student"
  ON "placements"("student_id") WHERE "is_current";

CREATE TABLE "placement_transfer_request" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "from_placement_id" TEXT NOT NULL,
    "to_placement_id" TEXT,
    "new_company_name" TEXT NOT NULL,
    "new_company_address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorization_letter_url" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,

    CONSTRAINT "placement_transfer_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "placement_transfer_request_student_id_idx"
  ON "placement_transfer_request"("student_id");

-- One OPEN request per placement, DB-enforced (TransferStatus is created in
-- this migration, so its value is usable in the predicate here).
CREATE UNIQUE INDEX "placement_transfer_request_one_open_per_placement"
  ON "placement_transfer_request"("from_placement_id") WHERE "status" = 'requested';

ALTER TABLE "placement_transfer_request" ADD CONSTRAINT "placement_transfer_request_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "placement_transfer_request" ADD CONSTRAINT "placement_transfer_request_from_placement_id_fkey"
  FOREIGN KEY ("from_placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "placement_transfer_request" ADD CONSTRAINT "placement_transfer_request_to_placement_id_fkey"
  FOREIGN KEY ("to_placement_id") REFERENCES "placements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "placement_transfer_request" ADD CONSTRAINT "placement_transfer_request_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

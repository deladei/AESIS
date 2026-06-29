-- Batch A — Final-grade spine + confidentiality + audit.
-- Fully additive / CREATE-only: a new enum, new enum values, new nullable
-- columns on cohort_configs (with defaults), and one new table. No existing
-- row, column, or type is dropped or altered destructively.

-- New grade-write audit actions.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'component_scored';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'grade_drafted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'grade_overridden';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'grade_signed_off';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'grade_released';

-- Final-grade lifecycle.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GradeStatus') THEN
    CREATE TYPE "GradeStatus" AS ENUM ('draft', 'approved', 'released');
  END IF;
END$$;

-- Cohort-configurable aggregation weights (percentage points, sum to 100).
ALTER TABLE "cohort_configs" ADD COLUMN IF NOT EXISTS "weight_industry"   INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "cohort_configs" ADD COLUMN IF NOT EXISTS "weight_university" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "cohort_configs" ADD COLUMN IF NOT EXISTS "weight_report"     INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "cohort_configs" ADD COLUMN IF NOT EXISTS "weight_logbook"    INTEGER NOT NULL DEFAULT 10;

-- One aggregated grade per placement.
CREATE TABLE IF NOT EXISTS "final_grades" (
  "id"                   TEXT NOT NULL,
  "placement_id"         TEXT NOT NULL,
  "industry_raw"         DOUBLE PRECISION,
  "university_raw"       DOUBLE PRECISION,
  "report_raw"           DOUBLE PRECISION,
  "logbook_raw"          DOUBLE PRECISION,
  "industry_weighted"    DOUBLE PRECISION,
  "university_weighted"  DOUBLE PRECISION,
  "report_weighted"      DOUBLE PRECISION,
  "logbook_weighted"     DOUBLE PRECISION,
  "total"                DOUBLE PRECISION,
  "coordinator_override" DOUBLE PRECISION,
  "override_reason"      TEXT,
  "status"               "GradeStatus" NOT NULL DEFAULT 'draft',
  "signed_off_by_id"     TEXT,
  "signed_off_at"        TIMESTAMP(3),
  "released_at"          TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "final_grades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "final_grades_placement_id_key" ON "final_grades"("placement_id");

ALTER TABLE "final_grades"
  ADD CONSTRAINT "final_grades_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "final_grades"
  ADD CONSTRAINT "final_grades_signed_off_by_id_fkey"
  FOREIGN KEY ("signed_off_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

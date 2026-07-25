-- SIWES daily logbook (Batch 1). Additive only. Mirrors the official UENR
-- industrial-attachment instrument (Weekly Progress Chart + Trainee's Weekly
-- Report). Teeth live here, not in app code: created_at immutability and
-- delete denial on evidence tables are database-enforced.
-- Batch 0 (industry_supervisor, assessment_token, webmail_domain,
-- assessment_industry) and Batch 2 (industry_weekly_comment) ship separately —
-- nothing here duplicates them.

-- ── Enums ─────────────────────────────────────────────────────
CREATE TYPE "AbsenceKind" AS ENUM ('sick', 'permitted', 'unexcused');

-- ── Cohort configuration (additive columns) ───────────────────
ALTER TABLE "cohort_configs"
  ADD COLUMN "duration_weeks" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "working_days" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN "entry_edit_window_days" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "sync_grace_days" INTEGER NOT NULL DEFAULT 3;

-- Logbook cover says 8 weeks, department says minimum 6; config absorbs the
-- discrepancy but never below the department floor.
ALTER TABLE "cohort_configs"
  ADD CONSTRAINT "cohort_duration_weeks_min" CHECK ("duration_weeks" >= 6);

-- ── daily_entry ───────────────────────────────────────────────
CREATE TABLE "daily_entry" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "placement_id" TEXT NOT NULL,
  "week_number" INTEGER NOT NULL,
  "work_date" DATE NOT NULL,
  "description_of_work" TEXT NOT NULL,
  "new_skills_learnt" TEXT NOT NULL,
  "sketch_url" TEXT,
  "client_drafted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_entry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_entry_week_number_positive" CHECK ("week_number" >= 1)
);
CREATE UNIQUE INDEX "daily_entry_student_id_work_date_key" ON "daily_entry"("student_id", "work_date");
CREATE INDEX "daily_entry_placement_id_idx" ON "daily_entry"("placement_id");

ALTER TABLE "daily_entry" ADD CONSTRAINT "daily_entry_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_entry" ADD CONSTRAINT "daily_entry_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- created_at is EVIDENCE (server-set, immutable). Lateness is derived from it
-- at read time so it cannot be tampered with. Clear message, not a bare denial.
CREATE OR REPLACE FUNCTION daily_entry_created_at_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'daily_entry.created_at is immutable: it is the server-side evidence of when the entry was recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_entry_no_created_at_change
  BEFORE UPDATE ON "daily_entry"
  FOR EACH ROW EXECUTE FUNCTION daily_entry_created_at_immutable();

-- Entries are evidence: no role deletes them, ever. A stale entry is corrected
-- by UPDATE (inside the window) — DELETE would hand back the power the edit
-- window removes (delete + re-insert = silent backfill).
CREATE OR REPLACE FUNCTION siwes_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are evidence and cannot be deleted', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_entry_no_delete
  BEFORE DELETE ON "daily_entry"
  FOR EACH ROW EXECUTE FUNCTION siwes_no_delete();

-- ── weekly_summary ────────────────────────────────────────────
CREATE TABLE "weekly_summary" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "placement_id" TEXT NOT NULL,
  "week_number" INTEGER NOT NULL,
  "week_ending" DATE NOT NULL,
  "report_text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_summary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_summary_week_number_positive" CHECK ("week_number" >= 1)
);
CREATE UNIQUE INDEX "weekly_summary_student_id_week_number_key" ON "weekly_summary"("student_id", "week_number");
CREATE INDEX "weekly_summary_placement_id_idx" ON "weekly_summary"("placement_id");

ALTER TABLE "weekly_summary" ADD CONSTRAINT "weekly_summary_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "weekly_summary" ADD CONSTRAINT "weekly_summary_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER weekly_summary_no_delete
  BEFORE DELETE ON "weekly_summary"
  FOR EACH ROW EXECUTE FUNCTION siwes_no_delete();

-- ── non_working_day ───────────────────────────────────────────
CREATE TABLE "non_working_day" (
  "id" TEXT NOT NULL,
  "academic_year_id" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "label" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "non_working_day_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "non_working_day_academic_year_id_day_key" ON "non_working_day"("academic_year_id", "day");

ALTER TABLE "non_working_day" ADD CONSTRAINT "non_working_day_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── absence ───────────────────────────────────────────────────
CREATE TABLE "absence" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "placement_id" TEXT NOT NULL,
  "absence_date" DATE NOT NULL,
  "kind" "AbsenceKind" NOT NULL,
  "reason" TEXT,
  "recorded_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "absence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "absence_student_id_absence_date_key" ON "absence"("student_id", "absence_date");
CREATE INDEX "absence_placement_id_idx" ON "absence"("placement_id");

ALTER TABLE "absence" ADD CONSTRAINT "absence_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "absence" ADD CONSTRAINT "absence_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "absence" ADD CONSTRAINT "absence_recorded_by_id_fkey"
  FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

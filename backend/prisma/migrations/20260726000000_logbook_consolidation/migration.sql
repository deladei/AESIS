-- Logbook consolidation, phase 1 (see docs/logbook-consolidation.md).
--
-- Merges the daily logbook into the weekly one so there is a single pipeline:
--   * logbook_entry is rekeyed from (placement, week) to (student, week), with
--     week numbers recomputed student-relative so a transfer no longer restarts
--     the count at 1;
--   * daily_entry hangs off logbook_entry, so the state machine, entry_event
--     audit, enrichment and grading finally reach daily content;
--   * entry_days is absorbed into daily_entry (status + submitted_at move; the
--     stored logged_late flag is dropped in favour of deriving lateness from the
--     immutable created_at);
--   * weekly_summary folds into entry_reflection.
--
-- DESTRUCTIVE: drops entry_days and weekly_summary at the end. Approved
-- 2026-07-25. Both are empty or near-empty in production (0 and 2 rows).

-- ── 1. logbook_entry gains the student, keyed student-relative ──────────────
ALTER TABLE "logbook_entry" ADD COLUMN "student_id" TEXT;

UPDATE "logbook_entry" e
SET "student_id" = p."student_id"
FROM "placements" p
WHERE p."id" = e."placement_id";

-- Week numbers become student-relative: anchored on the earliest placement in
-- the student's chain, mirroring siwes.calendar.ts::weekNumberFor.
WITH chain AS (
  SELECT "student_id", MIN("start_date")::date AS chain_start
  FROM "placements"
  WHERE "start_date" IS NOT NULL
  GROUP BY "student_id"
)
UPDATE "logbook_entry" e
SET "week_number" = GREATEST(1, (FLOOR((e."period_start" - c.chain_start) / 7.0) + 1)::int)
FROM chain c
WHERE c."student_id" = e."student_id";

-- Recomputing can only collide if a student holds overlapping placements. Fail
-- the whole migration loudly rather than let the unique index below half-apply:
-- a half-applied migration is what took production down for four days in S87.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "student_id", "week_number"
    FROM "logbook_entry"
    GROUP BY 1, 2
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'logbook_entry: % duplicate (student, week) pair(s) after recompute — resolve by hand before migrating', dup_count;
  END IF;
END $$;

ALTER TABLE "logbook_entry" ALTER COLUMN "student_id" SET NOT NULL;

ALTER TABLE "logbook_entry"
  ADD CONSTRAINT "logbook_entry_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "logbook_entry_placement_id_week_number_key";
CREATE UNIQUE INDEX "logbook_entry_student_id_week_number_key"
  ON "logbook_entry"("student_id", "week_number");

-- ── 2. daily_entry becomes the day: owned by a week, carrying its own state ──
ALTER TABLE "daily_entry" ADD COLUMN "entry_id" TEXT;
ALTER TABLE "daily_entry" ADD COLUMN "status" "DayStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "daily_entry" ADD COLUMN "submitted_at" TIMESTAMP(3);

-- Transitional: a day first touched through the weekly flow is a status row
-- whose content still lives in entry_activity. Phase 3 folds that table in here
-- and restores NOT NULL. The SIWES route still requires both fields via Zod.
ALTER TABLE "daily_entry" ALTER COLUMN "description_of_work" DROP NOT NULL;
ALTER TABLE "daily_entry" ALTER COLUMN "new_skills_learnt" DROP NOT NULL;

-- Create the owning week for any (student, week) that only exists on the daily
-- side or as a weekly summary.
INSERT INTO "logbook_entry" (
  "id", "placement_id", "student_id", "week_number",
  "period_start", "period_end", "status", "version", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  src."placement_id",
  src."student_id",
  src."week_number",
  MIN(src."day_start"),
  MAX(src."day_end"),
  'draft'::"EntryStatus",
  1, now(), now()
FROM (
  SELECT "placement_id", "student_id", "week_number", "work_date" AS "day_start", "work_date" AS "day_end"
  FROM "daily_entry"
  UNION ALL
  SELECT "placement_id", "student_id", "week_number", "week_ending" AS "day_start", "week_ending" AS "day_end"
  FROM "weekly_summary"
) src
WHERE NOT EXISTS (
  SELECT 1 FROM "logbook_entry" e
  WHERE e."student_id" = src."student_id" AND e."week_number" = src."week_number"
)
GROUP BY src."placement_id", src."student_id", src."week_number";

UPDATE "daily_entry" d
SET "entry_id" = e."id"
FROM "logbook_entry" e
WHERE e."student_id" = d."student_id" AND e."week_number" = d."week_number";

ALTER TABLE "daily_entry" ALTER COLUMN "entry_id" SET NOT NULL;

-- Cascade is intentional, but daily_entry's siwes_no_delete() trigger still
-- denies the delete — evidence rows outlive a week deletion attempt by design.
ALTER TABLE "daily_entry"
  ADD CONSTRAINT "daily_entry_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "daily_entry_entry_id_idx" ON "daily_entry"("entry_id");

-- ── 3. Absorb entry_days' state onto the matching day ───────────────────────
UPDATE "daily_entry" d
SET "status" = ed."status", "submitted_at" = ed."submitted_at"
FROM "entry_days" ed
WHERE ed."entry_id" = d."entry_id" AND ed."date" = d."work_date";

-- A day logged through the WEEKLY flow has an entry_days status row but no
-- daily_entry row at all (its content lives in entry_activity until Phase 3
-- folds that in). Without this those days lose their submitted state when
-- entry_days is dropped below — 2 such rows exist on prod today. Materialise
-- them: content stays NULL (that is what the nullable columns are for), and
-- created_at is carried over so the derived lateness stays truthful.
INSERT INTO "daily_entry" (
  "id", "entry_id", "student_id", "placement_id", "week_number", "work_date",
  "description_of_work", "new_skills_learnt", "status", "submitted_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  ed."entry_id", e."student_id", e."placement_id", e."week_number", ed."date",
  NULL, NULL, ed."status", ed."submitted_at",
  ed."created_at", now()
FROM "entry_days" ed
JOIN "logbook_entry" e ON e."id" = ed."entry_id"
ON CONFLICT ("student_id", "work_date") DO NOTHING;

-- ── 4. Fold the trainee's weekly report into the week's reflection ──────────
INSERT INTO "entry_reflection" ("entry_id", "learning", "challenges", "supervisor_visible", "updated_at")
SELECT e."id", ws."report_text", '', true, now()
FROM "weekly_summary" ws
JOIN "logbook_entry" e
  ON e."student_id" = ws."student_id" AND e."week_number" = ws."week_number"
ON CONFLICT ("entry_id") DO UPDATE
SET "learning" = CASE
      WHEN "entry_reflection"."learning" = '' THEN EXCLUDED."learning"
      ELSE "entry_reflection"."learning" || E'\n\n' || EXCLUDED."learning"
    END,
    "updated_at" = now();

-- The weekly report keeps the delete-denial it had as weekly_summary: it is
-- evidence, not configuration. Reflections are only ever upserted, never
-- deleted, so this costs the application nothing.
CREATE TRIGGER entry_reflection_no_delete
  BEFORE DELETE ON "entry_reflection"
  FOR EACH ROW EXECUTE FUNCTION siwes_no_delete();

-- ── 5. Drop the absorbed tables (destructive; approved) ─────────────────────
DROP TABLE "entry_days";
DROP TABLE "weekly_summary";

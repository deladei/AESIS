-- Attachment length becomes coordinator-configurable, and 5 weeks becomes legal.
--
-- `cohort_duration_weeks_min` was added in 20260718170000 with CHECK >= 6,
-- documented as "the logbook cover says 8 weeks, the department says minimum 6".
-- That floor made a 5-week cohort impossible to configure at all — the write
-- failed at the database, not at a rule anyone could change. The floor moves
-- into configuration: 1 week is the new hard bound, which only stops nonsense.
--
-- Data-preserving. No column is dropped and no row is deleted.

ALTER TABLE "cohort_configs"
  DROP CONSTRAINT IF EXISTS "cohort_duration_weeks_min";

ALTER TABLE "cohort_configs"
  ADD CONSTRAINT "cohort_duration_weeks_min" CHECK ("duration_weeks" >= 1);

-- The pilot runs a 5-week attachment. Only rows still sitting on the old
-- default are moved; a length somebody deliberately set to anything else is
-- left exactly as it is.
UPDATE "cohort_configs" SET "duration_weeks" = 5 WHERE "duration_weeks" = 6;

ALTER TABLE "cohort_configs" ALTER COLUMN "duration_weeks" SET DEFAULT 5;

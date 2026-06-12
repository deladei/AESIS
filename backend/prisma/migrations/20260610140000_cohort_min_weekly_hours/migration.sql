-- Per-week minimum attendance hours, configurable per cohort.
--
-- Drives the intern dashboard's cumulative-hours target + shortfall flag.
-- Additive: a single new column with a safe default (0 = no minimum, never
-- short). No existing row or column is altered.
ALTER TABLE "cohort_configs"
  ADD COLUMN IF NOT EXISTS "min_weekly_hours" INTEGER NOT NULL DEFAULT 0;

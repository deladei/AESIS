-- The attachment is six weeks, not five.
--
-- `duration_weeks` is THE single source of truth for "how long is this
-- programme": the logbook's week ceiling, every "week X of Y", and the
-- expected-hours total all read it. Its default was 5, so the one cohort in
-- production — which nobody had edited — reported a five-week attachment on
-- the logbook page.
--
-- Two changes, and the second is the one that actually fixes the screen:
--
--  1. The column default becomes 6, so a cohort created from here on is right
--     without anyone remembering to set it.
--
--  2. Rows still sitting on the old default are moved to 6. Changing a default
--     does not touch existing rows, so without this the running cohort would
--     have stayed on 5 forever.
--
-- The update is deliberately scoped to `= 5`. A cohort a coordinator has
-- explicitly set to some other length is that coordinator's decision and is
-- left alone; only the untouched default is corrected. If a five-week cohort
-- ever is deliberate, it stays settable — the value is coordinator-editable
-- (1..52) and the database bounds it only at >= 1.

ALTER TABLE "cohort_configs" ALTER COLUMN "duration_weeks" SET DEFAULT 6;

UPDATE "cohort_configs" SET "duration_weeks" = 6 WHERE "duration_weeks" = 5;

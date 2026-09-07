-- Holidays that come back every year.
--
-- A holiday was stored as one absolute date tied to one academic year, so
-- Independence Day had to be re-entered for every cohort — and a cohort that
-- spans a new year silently lost it. `recurring` matches on month + day-of-month
-- in any year instead.
--
-- Additive. Existing rows keep their exact behaviour (recurring = false).

ALTER TABLE "non_working_day"
  ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;

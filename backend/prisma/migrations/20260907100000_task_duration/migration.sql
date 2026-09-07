-- A to-do can say how long it is expected to take.
--
-- `due_at` was already a full timestamp, so a time of day was storable and the
-- UI simply never showed it. Duration had nowhere to live at all.
--
-- Additive and nullable: an existing task is open-ended, which is what it was.

ALTER TABLE "task"
  ADD COLUMN "duration_minutes" INTEGER;

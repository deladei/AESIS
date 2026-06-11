-- Add a terminal `rejected` state to the weekly-entry lifecycle.
--
-- `reject` (submitted -> rejected) lets a supervisor decline a week outright,
-- distinct from `return` (submitted -> returned), which invites a revision.
-- Additive: a new enum value only — no existing row or column changes.
ALTER TYPE "EntryStatus" ADD VALUE IF NOT EXISTS 'rejected';

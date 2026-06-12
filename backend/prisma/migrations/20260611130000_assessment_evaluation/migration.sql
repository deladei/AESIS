-- Final assessment closeout (BATCH 4 / feature 3).
--
-- Adds the structured end-of-placement evaluation form to the binding
-- assessment. Fully additive: one new nullable JSONB column, no existing
-- column or row altered. Sign-off reuses the existing academic_supervisor_id +
-- finalized_at; immutability is already enforced once finalized_at is set.
ALTER TABLE "placement_assessment"
  ADD COLUMN "evaluation" JSONB;

-- Finalization waivers: record the reasons an academic supervisor finalized a
-- placement with one or more weeks not acknowledged. Advisory/audit metadata on
-- the binding finalization record; shape is
-- [{ weekNumber, reason, waivedBy, waivedAt }].
ALTER TABLE "placement_assessment" ADD COLUMN "waivers" JSONB;

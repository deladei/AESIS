-- Region-based placement + supervisor assignment.
--
-- Fully additive: one new enum and two new nullable columns. No existing table,
-- column, or row is altered or dropped. Backfill is unnecessary — both columns
-- are nullable and existing placements simply have no region until edited.
--
-- Model: a student's placement sits in exactly one Ghana region; an academic
-- supervisor is assigned (by the coordinator) to exactly one region and
-- supervises every intern placed there. New interns are auto-balanced across
-- all supervisors sharing the region. Assignment/balancing is app-layer
-- (auth.service + placements.service.pickLeastLoadedSupervisor).

-- 1. The 16 administrative regions of Ghana (2019 demarcation).
CREATE TYPE "Region" AS ENUM (
  'ahafo',
  'ashanti',
  'bono',
  'bono_east',
  'central',
  'eastern',
  'greater_accra',
  'north_east',
  'northern',
  'oti',
  'savannah',
  'upper_east',
  'upper_west',
  'volta',
  'western',
  'western_north'
);

-- 2. Academic supervisor's covered region (null until coordinator assigns it).
ALTER TABLE "users" ADD COLUMN "supervised_region" "Region";

-- 3. The student placement's region (null on legacy placements).
ALTER TABLE "placements" ADD COLUMN "region" "Region";

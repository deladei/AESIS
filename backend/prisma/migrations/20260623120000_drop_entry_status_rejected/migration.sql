-- Consolidate the weekly-entry lifecycle: the terminal `rejected` state
-- duplicated `returned` (both mean "the supervisor would not accept this week").
-- We drop `rejected` from the EntryStatus enum.
--
-- Data-preserving: any existing `rejected` rows are remapped to `returned`
-- BEFORE the value is removed (a returned week can be revised + resubmitted,
-- which is the more forgiving and now-canonical outcome).

-- 1. Remap existing data off the value being removed.
UPDATE "logbook_entry" SET "status" = 'returned' WHERE "status" = 'rejected';
UPDATE "entry_event"   SET "from_status" = 'returned' WHERE "from_status" = 'rejected';
UPDATE "entry_event"   SET "to_status"   = 'returned' WHERE "to_status"   = 'rejected';

-- 2. Recreate the enum without `rejected` and re-point the columns.
ALTER TYPE "EntryStatus" RENAME TO "EntryStatus_old";
CREATE TYPE "EntryStatus" AS ENUM ('draft', 'submitted', 'returned', 'acknowledged');

ALTER TABLE "logbook_entry" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "logbook_entry" ALTER COLUMN "status" TYPE "EntryStatus" USING ("status"::text::"EntryStatus");
ALTER TABLE "entry_event"   ALTER COLUMN "from_status" TYPE "EntryStatus" USING ("from_status"::text::"EntryStatus");
ALTER TABLE "entry_event"   ALTER COLUMN "to_status"   TYPE "EntryStatus" USING ("to_status"::text::"EntryStatus");
ALTER TABLE "logbook_entry" ALTER COLUMN "status" SET DEFAULT 'draft';

DROP TYPE "EntryStatus_old";

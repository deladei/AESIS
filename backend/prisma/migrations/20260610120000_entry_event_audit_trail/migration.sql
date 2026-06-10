-- Extend the append-only entry_event log into a full audit trail.
--
-- Adds actor role, an event-type discriminator, and field-level before/after
-- snapshots, and widens to_status to nullable so non-transition events
-- (created/edited/scored) need no synthetic status. Everything here is additive
-- or a nullable-widening — no column is dropped and no data is destroyed.
--
-- Existing rows are backfilled. The append-only trigger rejects UPDATE, so it is
-- disabled for the backfill only, then re-enabled — the log stays immutable to
-- the application at all times.

-- 1. Event-type discriminator.
CREATE TYPE "EntryEventType" AS ENUM ('created', 'edited', 'transitioned', 'scored');

-- 2. New columns — all nullable, safe to add against a populated table.
ALTER TABLE "entry_event"
  ADD COLUMN "actor_role" "UserRole",
  ADD COLUMN "event_type" "EntryEventType",
  ADD COLUMN "before"     JSONB,
  ADD COLUMN "after"      JSONB;

-- 3. Non-transition events (edited/scored) carry no to_status.
ALTER TABLE "entry_event" ALTER COLUMN "to_status" DROP NOT NULL;

-- 4. Backfill historical rows with the append-only trigger temporarily off.
ALTER TABLE "entry_event" DISABLE TRIGGER "entry_event_no_update";

-- Actor role: best-effort from the actor's current role (role-at-time was not
-- previously recorded).
UPDATE "entry_event" e
SET "actor_role" = u."role"
FROM "users" u
WHERE e."actor_id" = u."id" AND e."actor_role" IS NULL;

-- Event type: genesis (no from_status) -> created; a scored row -> scored;
-- everything else was a state-machine move -> transitioned.
UPDATE "entry_event"
SET "event_type" = CASE
  WHEN "from_status" IS NULL THEN 'created'::"EntryEventType"
  WHEN "score" IS NOT NULL   THEN 'scored'::"EntryEventType"
  ELSE 'transitioned'::"EntryEventType"
END
WHERE "event_type" IS NULL;

ALTER TABLE "entry_event" ENABLE TRIGGER "entry_event_no_update";

-- Rollback for 20260905102136_dashboard_domains.
-- Prisma reads only migration.sql, so this file is inert; it exists so the
-- change can be reversed by hand. Purely additive forward, so the inverse is a
-- clean drop — no data predates these tables.
DROP INDEX IF EXISTS "approval_request_one_open_per_placement_kind";
ALTER TABLE "resource" DROP CONSTRAINT IF EXISTS "resource_has_a_target";

DROP TABLE IF EXISTS "application_event";
DROP TABLE IF EXISTS "opportunity_application";
DROP TABLE IF EXISTS "internship_opportunity";
DROP TABLE IF EXISTS "resource";
DROP TABLE IF EXISTS "approval_request";
DROP TABLE IF EXISTS "task";

ALTER TABLE "placements"          DROP COLUMN IF EXISTS "source_application_id";
ALTER TABLE "users"               DROP COLUMN IF EXISTS "academic_level";
ALTER TABLE "companies"           DROP COLUMN IF EXISTS "logo_url",
                                  DROP COLUMN IF EXISTS "logo_public_id",
                                  DROP COLUMN IF EXISTS "description",
                                  DROP COLUMN IF EXISTS "contact_email",
                                  DROP COLUMN IF EXISTS "contact_phone",
                                  DROP COLUMN IF EXISTS "is_partner",
                                  DROP COLUMN IF EXISTS "partner_since";
ALTER TABLE "placement_documents" DROP COLUMN IF EXISTS "title",
                                  DROP COLUMN IF EXISTS "storage_public_id",
                                  DROP COLUMN IF EXISTS "owner_user_id",
                                  DROP COLUMN IF EXISTS "uploaded_by_id",
                                  DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE "visit_schedules"     DROP COLUMN IF EXISTS "visit_type",
                                  DROP COLUMN IF EXISTS "duration_minutes",
                                  DROP COLUMN IF EXISTS "location",
                                  DROP COLUMN IF EXISTS "outcome_note",
                                  DROP COLUMN IF EXISTS "cancelled_at",
                                  DROP COLUMN IF EXISTS "cancel_reason",
                                  DROP COLUMN IF EXISTS "created_by_id",
                                  DROP COLUMN IF EXISTS "updated_at";

DROP TYPE IF EXISTS "ApplicationEventType";
DROP TYPE IF EXISTS "ApplicationStatus";
DROP TYPE IF EXISTS "OpportunityStatus";
DROP TYPE IF EXISTS "ResourceCategory";
DROP TYPE IF EXISTS "ApprovalStatus";
DROP TYPE IF EXISTS "ApprovalKind";
DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "TaskCategory";
DROP TYPE IF EXISTS "VisitType";

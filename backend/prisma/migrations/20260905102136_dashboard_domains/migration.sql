-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('site_visit', 'review_meeting', 'midterm_review', 'final_review', 'check_in');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('report', 'review', 'admin', 'meeting', 'other');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('leave', 'extension', 'supervisor_change', 'training_plan');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('requested', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ResourceCategory" AS ENUM ('guideline', 'template', 'rubric', 'policy', 'form', 'sample', 'other');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('draft', 'published', 'closed', 'filled');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'under_review', 'shortlisted', 'offered', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ApplicationEventType" AS ENUM ('submitted', 'status_changed', 'withdrawn', 'note_added');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_partner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "logo_public_id" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "partner_since" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "placement_documents" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "storage_public_id" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "uploaded_by_id" TEXT;

-- AlterTable
ALTER TABLE "placements" ADD COLUMN     "source_application_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "academic_level" INTEGER;

-- AlterTable
ALTER TABLE "visit_schedules" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "duration_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "outcome_note" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "visit_type" "VisitType" NOT NULL DEFAULT 'review_meeting';

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "placement_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TaskCategory" NOT NULL DEFAULT 'other',
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "source_type" TEXT,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'requested',
    "requested_by_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "attachment_url" TEXT,
    "payload" JSONB,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "effect_applied_at" TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ResourceCategory" NOT NULL DEFAULT 'other',
    "file_url" TEXT,
    "file_public_id" TEXT,
    "external_url" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "audience_roles" "UserRole"[],
    "academic_year_id" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internship_opportunity" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "posted_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT,
    "required_skills" TEXT[],
    "region" "Region",
    "location" TEXT,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "min_academic_level" INTEGER,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "status" "OpportunityStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internship_opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_application" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "statement" TEXT,
    "cv_document_id" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_event" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "type" "ApplicationEventType" NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus",
    "actor_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assignee_id_status_due_at_idx" ON "task"("assignee_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "task_placement_id_idx" ON "task"("placement_id");

-- CreateIndex
CREATE INDEX "approval_request_placement_id_status_idx" ON "approval_request"("placement_id", "status");

-- CreateIndex
CREATE INDEX "approval_request_student_id_idx" ON "approval_request"("student_id");

-- CreateIndex
CREATE INDEX "resource_is_published_category_sort_order_idx" ON "resource"("is_published", "category", "sort_order");

-- CreateIndex
CREATE INDEX "internship_opportunity_status_closes_at_idx" ON "internship_opportunity"("status", "closes_at");

-- CreateIndex
CREATE INDEX "internship_opportunity_company_id_idx" ON "internship_opportunity"("company_id");

-- CreateIndex
CREATE INDEX "opportunity_application_student_id_status_idx" ON "opportunity_application"("student_id", "status");

-- CreateIndex
CREATE INDEX "opportunity_application_status_submitted_at_idx" ON "opportunity_application"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_application_opportunity_id_student_id_key" ON "opportunity_application"("opportunity_id", "student_id");

-- CreateIndex
CREATE INDEX "application_event_application_id_idx" ON "application_event"("application_id");

-- CreateIndex
CREATE INDEX "application_event_type_created_at_idx" ON "application_event"("type", "created_at");

-- CreateIndex
CREATE INDEX "companies_is_partner_idx" ON "companies"("is_partner");

-- CreateIndex
CREATE INDEX "placement_documents_owner_user_id_uploaded_at_idx" ON "placement_documents"("owner_user_id", "uploaded_at");

-- CreateIndex
CREATE UNIQUE INDEX "placements_source_application_id_key" ON "placements"("source_application_id");

-- CreateIndex
CREATE INDEX "visit_schedules_supervisor_id_scheduled_at_idx" ON "visit_schedules"("supervisor_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "visit_schedules_placement_id_scheduled_at_idx" ON "visit_schedules"("placement_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_source_application_id_fkey" FOREIGN KEY ("source_application_id") REFERENCES "opportunity_application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_documents" ADD CONSTRAINT "placement_documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_documents" ADD CONSTRAINT "placement_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_schedules" ADD CONSTRAINT "visit_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_opportunity" ADD CONSTRAINT "internship_opportunity_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_opportunity" ADD CONSTRAINT "internship_opportunity_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internship_opportunity" ADD CONSTRAINT "internship_opportunity_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "internship_opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_cv_document_id_fkey" FOREIGN KEY ("cv_document_id") REFERENCES "placement_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_application" ADD CONSTRAINT "opportunity_application_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "opportunity_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill document ownership from the placement's student. Idempotent, and
-- the column stays nullable rather than being tightened afterwards, so this can
-- never fail on a row we did not anticipate.
UPDATE "placement_documents" d
   SET "owner_user_id" = p."student_id"
  FROM "placements" p
 WHERE p."id" = d."placement_id"
   AND d."owner_user_id" IS NULL;

-- A resource with neither a file nor a link is an empty card.
ALTER TABLE "resource"
  ADD CONSTRAINT "resource_has_a_target"
  CHECK ("file_url" IS NOT NULL OR "external_url" IS NOT NULL) NOT VALID;

-- One open request per kind per placement. Prisma cannot express a partial
-- unique index; same technique as placement_transfer_request's.
CREATE UNIQUE INDEX "approval_request_one_open_per_placement_kind"
  ON "approval_request"("placement_id", "kind")
  WHERE "status" = 'requested';

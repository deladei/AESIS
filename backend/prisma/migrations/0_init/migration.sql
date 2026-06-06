-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'academic_supervisor', 'company_supervisor', 'coordinator', 'admin');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('pending', 'active', 'completed', 'withdrawn', 'failed');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'flagged');

-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('risk_alert', 'feedback_received', 'submission_reminder', 'placement_approved', 'placement_rejected', 'escalation', 'system');

-- CreateEnum
CREATE TYPE "EscalationAction" AS ENUM ('check_in_scheduled', 'escalated_to_coordinator', 'dismissed');

-- CreateEnum
CREATE TYPE "EscalationOutcome" AS ENUM ('site_visit_requested', 'placement_transfer_initiated', 'resolved', 'pending');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('role_change', 'data_export', 'ai_override', 'placement_status_change', 'escalation_created', 'escalation_resolved', 'logbook_override');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_programmes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohort_configs" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "submission_deadline_day" INTEGER NOT NULL DEFAULT 5,
    "submission_deadline_hour" INTEGER NOT NULL DEFAULT 23,
    "submission_deadline_minute" INTEGER NOT NULL DEFAULT 59,
    "reminder_day_of_week" INTEGER NOT NULL DEFAULT 1,
    "reminder_hour" INTEGER NOT NULL DEFAULT 8,
    "total_weeks" INTEGER NOT NULL DEFAULT 24,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohort_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "department_id" TEXT NOT NULL,
    "programme_id" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "password_reset_token" TEXT,
    "password_reset_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "academic_supervisor_id" TEXT,
    "company_supervisor_id" TEXT,
    "company_id" TEXT,
    "academic_year_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "placement_status" "PlacementStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_submissions" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "mongo_doc_id" TEXT,
    "submission_status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "ai_analysis_status" "AiAnalysisStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMP(3),
    "deadline" TIMESTAMP(3) NOT NULL,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_attachments" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logbook_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logbook_analyses" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "quality_score" DECIMAL(5,2),
    "task_depth_score" DECIMAL(5,2),
    "tech_vocab_score" DECIMAL(5,2),
    "reflection_score" DECIMAL(5,2),
    "temporal_consistency_score" DECIMAL(5,2),
    "relevance_score" DECIMAL(4,3),
    "is_relevance_flagged" BOOLEAN NOT NULL DEFAULT false,
    "plagiarism_similarity" DECIMAL(4,3),
    "is_plagiarism_flagged" BOOLEAN NOT NULL DEFAULT false,
    "plagiarism_match_ids" TEXT[],
    "authenticity_flag" BOOLEAN NOT NULL DEFAULT false,
    "sentiment_polarity" DECIMAL(4,3),
    "sentiment_class" TEXT,
    "shap_values" JSONB,
    "ai_feedback_summary" TEXT,
    "computed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logbook_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_risk_scores" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "risk_score" DECIMAL(4,3) NOT NULL,
    "risk_tier" "RiskTier" NOT NULL,
    "previous_tier" "RiskTier",
    "top_risk_factors" TEXT[],
    "shap_values" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_risk_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_feedback" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "rating" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_escalations" (
    "id" TEXT NOT NULL,
    "risk_score_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "action" "EscalationAction" NOT NULL,
    "dismiss_reason" TEXT,
    "outcome" "EscalationOutcome",
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_documents" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_schedules" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mongo_session_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_programmes_code_key" ON "academic_programmes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_label_key" ON "academic_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "cohort_configs_academic_year_id_key" ON "cohort_configs"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "logbook_submissions_placement_id_week_number_key" ON "logbook_submissions"("placement_id", "week_number");

-- CreateIndex
CREATE UNIQUE INDEX "logbook_analyses_submission_id_key" ON "logbook_analyses"("submission_id");

-- AddForeignKey
ALTER TABLE "academic_programmes" ADD CONSTRAINT "academic_programmes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohort_configs" ADD CONSTRAINT "cohort_configs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "academic_programmes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_academic_supervisor_id_fkey" FOREIGN KEY ("academic_supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_company_supervisor_id_fkey" FOREIGN KEY ("company_supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_submissions" ADD CONSTRAINT "logbook_submissions_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_submissions" ADD CONSTRAINT "logbook_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_attachments" ADD CONSTRAINT "logbook_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "logbook_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logbook_analyses" ADD CONSTRAINT "logbook_analyses_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "logbook_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_scores" ADD CONSTRAINT "student_risk_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_risk_scores" ADD CONSTRAINT "student_risk_scores_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_feedback" ADD CONSTRAINT "supervisor_feedback_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "logbook_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_feedback" ADD CONSTRAINT "supervisor_feedback_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_escalations" ADD CONSTRAINT "risk_escalations_risk_score_id_fkey" FOREIGN KEY ("risk_score_id") REFERENCES "student_risk_scores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_escalations" ADD CONSTRAINT "risk_escalations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_documents" ADD CONSTRAINT "placement_documents_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_schedules" ADD CONSTRAINT "visit_schedules_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_schedules" ADD CONSTRAINT "visit_schedules_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


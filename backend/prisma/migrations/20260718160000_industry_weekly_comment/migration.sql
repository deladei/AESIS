-- The logbook's weekly comment block: each unit supervisor comments on the
-- trainee's performance for the week, with their name, unit and date. This is
-- FORMATIVE — the student reads it (unlike the confidential
-- assessment_industry). Two arrival paths with the same evidence rule as the
-- assessment: a paper comment keyed in by staff (the scan is the evidence) or
-- a single-use tokenised link (the token is the evidence).

CREATE TABLE "industry_weekly_comment" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "industry_supervisor_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "supervisor_name" TEXT NOT NULL,
    "department_unit" TEXT,
    "comment_date" DATE NOT NULL,
    "origin" "RecordOrigin" NOT NULL DEFAULT 'digital',
    "scan_url" TEXT,
    "entered_by_id" TEXT,
    "token_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_weekly_comment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "iwc_week_number_positive" CHECK ("week_number" >= 1),
    CONSTRAINT "iwc_paper_needs_evidence" CHECK (
        ("origin" = 'paper'   AND "scan_url" IS NOT NULL AND "entered_by_id" IS NOT NULL)
     OR ("origin" = 'digital' AND "token_id" IS NOT NULL AND "entered_by_id" IS NULL)
    )
);

CREATE INDEX "industry_weekly_comment_placement_id_week_number_idx"
  ON "industry_weekly_comment"("placement_id", "week_number");

ALTER TABLE "industry_weekly_comment" ADD CONSTRAINT "industry_weekly_comment_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "industry_weekly_comment" ADD CONSTRAINT "industry_weekly_comment_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "industry_weekly_comment" ADD CONSTRAINT "industry_weekly_comment_industry_supervisor_id_fkey"
  FOREIGN KEY ("industry_supervisor_id") REFERENCES "industry_supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "industry_weekly_comment" ADD CONSTRAINT "industry_weekly_comment_entered_by_id_fkey"
  FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

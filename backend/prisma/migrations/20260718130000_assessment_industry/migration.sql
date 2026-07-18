-- The Industrial Attachment Performance Evaluation Form — criteria and maxima
-- verbatim from the paper instrument (sum = 100). CONFIDENTIAL: staff-only at
-- the application layer; on paper it travelled under confidential cover to the
-- Head of Department, hidden from the student AND the university supervisor.

-- Evidence-origin for records that may arrive on paper (scan keyed in by
-- staff) or digitally (tokenised link). Local DBs had this type via db push,
-- which masked its absence from the migration chain until CI replayed it.
CREATE TYPE "RecordOrigin" AS ENUM ('digital', 'paper');

CREATE TABLE "assessment_industry" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "industry_supervisor_id" TEXT NOT NULL,
    "attendance" INTEGER NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "cooperation" INTEGER NOT NULL,
    "aptitude" INTEGER NOT NULL,
    "understanding" INTEGER NOT NULL,
    "safety" INTEGER NOT NULL,
    "autonomy" INTEGER NOT NULL,
    "raw_total" INTEGER NOT NULL,
    "additional_comments" TEXT,
    "reporting_officer_name" TEXT NOT NULL,
    "reporting_officer_designation" TEXT,
    "company_hod_name" TEXT,
    "origin" "RecordOrigin" NOT NULL DEFAULT 'digital',
    "scan_url" TEXT,
    "entered_by_id" TEXT,
    "token_id" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_industry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_industry_placement_id_industry_supervisor_id_key"
  ON "assessment_industry"("placement_id", "industry_supervisor_id");

ALTER TABLE "assessment_industry" ADD CONSTRAINT "assessment_industry_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_industry" ADD CONSTRAINT "assessment_industry_industry_supervisor_id_fkey"
  FOREIGN KEY ("industry_supervisor_id") REFERENCES "industry_supervisor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessment_industry" ADD CONSTRAINT "assessment_industry_entered_by_id_fkey"
  FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Instrument maxima, verbatim: Attendance 20, Punctuality 15, Co-operation 10,
-- Aptitude 15, Understanding of job 20, Safety 10, Autonomy 10 — total 100.
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_attendance_range    CHECK ("attendance"    BETWEEN 0 AND 20);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_punctuality_range   CHECK ("punctuality"   BETWEEN 0 AND 15);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_cooperation_range   CHECK ("cooperation"   BETWEEN 0 AND 10);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_aptitude_range      CHECK ("aptitude"      BETWEEN 0 AND 15);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_understanding_range CHECK ("understanding" BETWEEN 0 AND 20);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_safety_range        CHECK ("safety"        BETWEEN 0 AND 10);
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_autonomy_range      CHECK ("autonomy"      BETWEEN 0 AND 10);

-- raw_total is always the criteria sum — a poisoned total can never persist.
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_raw_total_is_sum CHECK (
  "raw_total" = "attendance" + "punctuality" + "cooperation" + "aptitude" + "understanding" + "safety" + "autonomy"
);

-- Paper needs its evidence (scan + who keyed it); digital needs its token and
-- must NOT name a staff enterer.
ALTER TABLE "assessment_industry" ADD CONSTRAINT ai_paper_needs_evidence CHECK (
  ("origin" = 'paper'   AND "scan_url" IS NOT NULL AND "entered_by_id" IS NOT NULL)
  OR
  ("origin" = 'digital' AND "token_id" IS NOT NULL AND "entered_by_id" IS NULL)
);

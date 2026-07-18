-- Single-use, time-bound, scoped tokens for industry-supervisor writes.
-- Only the SHA-256 hash is stored; the raw token exists only in the link.

CREATE TYPE "TokenPurpose" AS ENUM ('weekly_comment', 'final_assessment');

CREATE TABLE "assessment_token" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "industry_supervisor_id" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "week_number" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assessment_token_token_hash_key" ON "assessment_token"("token_hash");
CREATE INDEX "assessment_token_placement_id_idx" ON "assessment_token"("placement_id");

ALTER TABLE "assessment_token" ADD CONSTRAINT "assessment_token_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_token" ADD CONSTRAINT "assessment_token_industry_supervisor_id_fkey"
  FOREIGN KEY ("industry_supervisor_id") REFERENCES "industry_supervisor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_token" ADD CONSTRAINT "assessment_token_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- THE TEETH of the verification control: a final_assessment token (the 30-mark
-- channel) can only ever be issued for a verified supervisor. Enforced here in
-- the database, not in application code alone, so no code path — present or
-- future — can hand the assessment link to an unverified contact.
CREATE OR REPLACE FUNCTION fn_assessment_token_gate() RETURNS trigger AS $$
DECLARE
  v_status "VerificationStatus";
BEGIN
  IF NEW.purpose = 'final_assessment' THEN
    SELECT verification_status INTO v_status
    FROM industry_supervisor WHERE id = NEW.industry_supervisor_id;
    IF v_status IS NULL OR v_status NOT IN ('coordinator_approved', 'visit_confirmed') THEN
      RAISE EXCEPTION 'A final_assessment token requires a verified industry supervisor (status: %)',
        COALESCE(v_status::text, 'missing');
    END IF;
  END IF;

  IF NEW.purpose = 'weekly_comment' AND NEW.week_number IS NULL THEN
    RAISE EXCEPTION 'A weekly_comment token requires a week_number';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assessment_token_gate
  BEFORE INSERT ON "assessment_token"
  FOR EACH ROW EXECUTE FUNCTION fn_assessment_token_gate();

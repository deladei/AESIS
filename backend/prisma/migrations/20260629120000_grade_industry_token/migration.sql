-- Batch B — tokenised company-supervisor industry-score channel.
-- Fully additive / CREATE-only: three new nullable columns on final_grades for
-- the single-use magic-link token (hash + expiry) and the submission stamp.
-- No existing row, column, or type is dropped or altered destructively.

ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "industry_token_hash"       TEXT;
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "industry_token_expires_at" TIMESTAMP(3);
ALTER TABLE "final_grades" ADD COLUMN IF NOT EXISTS "industry_submitted_at"     TIMESTAMP(3);

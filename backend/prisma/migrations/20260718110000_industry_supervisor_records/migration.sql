-- Industry supervisors are RECORDS, not users: they act only via single-use
-- tokenised links. Verification restores the control the paper form's
-- letterhead/signature provided (contact details come from the student and the
-- assessment is worth 30/100 marks).

CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'coordinator_approved', 'visit_confirmed', 'rejected');

CREATE TYPE "EmailDomainType" AS ENUM ('company', 'webmail', 'none');

CREATE TABLE "industry_supervisor" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department_unit" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "email_domain_type" "EmailDomainType" NOT NULL DEFAULT 'none',
    "period_start" DATE,
    "period_end" DATE,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "verified_by_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "verification_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industry_supervisor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "industry_supervisor_placement_id_idx" ON "industry_supervisor"("placement_id");

ALTER TABLE "industry_supervisor" ADD CONSTRAINT "industry_supervisor_placement_id_fkey"
  FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "industry_supervisor" ADD CONSTRAINT "industry_supervisor_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Coordinator-extendable webmail lookup. Classifies; never blocks.
CREATE TABLE "webmail_domain" (
    "domain" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webmail_domain_pkey" PRIMARY KEY ("domain")
);

INSERT INTO "webmail_domain" ("domain") VALUES
  ('gmail.com'), ('googlemail.com'), ('yahoo.com'), ('ymail.com'), ('hotmail.com'),
  ('outlook.com'), ('live.com'), ('icloud.com'), ('aol.com'), ('protonmail.com'),
  ('proton.me'), ('mail.com')
ON CONFLICT DO NOTHING;

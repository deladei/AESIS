-- Reconcile columns that exist in schema.prisma (and in prod) but had NO
-- migration folder. They were applied to prod out-of-band via `prisma db push`
-- / manual ALTER, so `migrate deploy` from the folders alone produced a schema
-- MISSING these columns vs the Prisma client. See HANDOFF S41 "CRITICAL FINDING"
-- and S42 (performance_threshold was applied with no folder).
--
--   * cohort_configs.performance_threshold  (S42, INT default 50)
--   * placements.flagged_at / flag_reason / flagged_by_id  (placement-flag feature)
--
-- Idempotent (ADD COLUMN IF NOT EXISTS): a safe no-op on prod (Neon was built
-- via db push and already has every column) and purely additive on a fresh
-- `migrate deploy`. No FK on flagged_by_id by design (see schema.prisma).

ALTER TABLE "cohort_configs" ADD COLUMN IF NOT EXISTS "performance_threshold" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "placements" ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMP(3);
ALTER TABLE "placements" ADD COLUMN IF NOT EXISTS "flag_reason" TEXT;
ALTER TABLE "placements" ADD COLUMN IF NOT EXISTS "flagged_by_id" TEXT;

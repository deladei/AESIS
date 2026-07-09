-- Additive: enrichment report fields on ai_assessment (advisory only).
-- quality        — 6-dimension rubric breakdown (0-100 each), flags + rubric feedback
-- plagiarism     — similarity report against other submitted entries
-- feedback_draft — Groq draft for the SUPERVISOR to edit (human-in-loop); never student-facing as-is
ALTER TABLE "ai_assessment" ADD COLUMN "quality" JSONB;
ALTER TABLE "ai_assessment" ADD COLUMN "plagiarism" JSONB;
ALTER TABLE "ai_assessment" ADD COLUMN "feedback_draft" JSONB;

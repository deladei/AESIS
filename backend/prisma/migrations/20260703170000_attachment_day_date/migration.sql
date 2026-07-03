-- Day-scoped logbook attachments: each file now evidences one working day.
-- Nullable: rows uploaded before this change were week-level evidence.
ALTER TABLE "entry_attachment" ADD COLUMN "day_date" DATE;

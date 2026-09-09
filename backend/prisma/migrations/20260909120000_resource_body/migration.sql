-- A resource can now be written guidance on its own — a notice or a set of
-- instructions the coordinator types in, with no file and no link to point at.
-- Until now `resource` could only be a pointer (file_url / external_url), so
-- there was nowhere to publish a paragraph of guidance to a student's shelf.
ALTER TABLE "resource" ADD COLUMN IF NOT EXISTS "body" TEXT;

-- The card must still carry something, but "something" now includes the text
-- itself. The old constraint predates `body` and would reject a typed notice,
-- which is exactly what the column was added for.
ALTER TABLE "resource" DROP CONSTRAINT IF EXISTS "resource_has_a_target";
ALTER TABLE "resource"
  ADD CONSTRAINT "resource_has_a_target"
  CHECK (
    "file_url" IS NOT NULL
    OR "external_url" IS NOT NULL
    OR ("body" IS NOT NULL AND length(btrim("body")) > 0)
  ) NOT VALID;

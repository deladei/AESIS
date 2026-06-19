-- Image / document attachments on weekly logbook entries.
--
-- Fully additive: one new enum and one new table. No existing table, column,
-- or row is altered. Files are stored in Cloudinary; `public_id` is the handle
-- used to delete the remote object when the row is removed. Write access
-- (insert/delete) is enforced in the app layer (entries.service +
-- assertPlacementAccess + the entry state machine) — attachable only while the
-- entry is editable (draft/returned) and only by the owning student.

-- 1. Attachment kind (drives image-vs-document rendering in the UI).
CREATE TYPE "AttachmentKind" AS ENUM ('image', 'document');

-- 2. Attachments belong to a logbook entry; cascade on entry delete.
CREATE TABLE "entry_attachment" (
  "id"             TEXT NOT NULL,
  "entry_id"       TEXT NOT NULL,
  "file_url"       TEXT NOT NULL,
  "public_id"      TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "mime_type"      TEXT NOT NULL,
  "kind"           "AttachmentKind" NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entry_attachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "entry_attachment_entry_id_idx" ON "entry_attachment"("entry_id");

ALTER TABLE "entry_attachment"
  ADD CONSTRAINT "entry_attachment_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "logbook_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entry_attachment"
  ADD CONSTRAINT "entry_attachment_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

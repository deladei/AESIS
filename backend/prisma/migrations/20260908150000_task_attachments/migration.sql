-- Briefs and templates a supervisor attaches to work they set for students.
--
-- Same shape, storage path and limits as message_attachment and
-- entry_attachment — one upload mechanism, not a third.
--
-- Setting one assignment for several students creates one task each, and those
-- rows SHARE a Cloudinary asset: the file is uploaded once and public_id
-- repeats. Hence the index on public_id — deleting a row has to ask whether it
-- is the last one holding that asset before removing it remotely.
--
-- Additive: a new table only. Nothing existing is altered or dropped.

CREATE TABLE "task_attachment" (
  "id"             TEXT NOT NULL,
  "task_id"        TEXT NOT NULL,
  "file_url"       TEXT NOT NULL,
  "public_id"      TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "mime_type"      TEXT NOT NULL,
  "kind"           "AttachmentKind" NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "task_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_attachment_task_id_idx"   ON "task_attachment"("task_id");
CREATE INDEX "task_attachment_public_id_idx" ON "task_attachment"("public_id");

ALTER TABLE "task_attachment"
  ADD CONSTRAINT "task_attachment_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

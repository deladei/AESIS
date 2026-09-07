-- Files in a mentorship thread.
--
-- The composer was text-only and `messages` had nowhere to hang a file, so a
-- supervisor asking for a screenshot had to send the student elsewhere. Same
-- storage path, limits and MIME allow-list as `entry_attachment` — one upload
-- mechanism, not two.
--
-- Additive: no existing column changes, and a message with no attachment is
-- exactly what every existing row is.

CREATE TABLE "message_attachment" (
  "id"             TEXT NOT NULL,
  "message_id"     TEXT NOT NULL,
  "file_url"       TEXT NOT NULL,
  "public_id"      TEXT NOT NULL,
  "file_name"      TEXT NOT NULL,
  "file_size"      INTEGER NOT NULL,
  "mime_type"      TEXT NOT NULL,
  "kind"           "AttachmentKind" NOT NULL,
  "uploaded_by_id" TEXT NOT NULL,
  "uploaded_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_attachment_message_id_idx" ON "message_attachment"("message_id");

ALTER TABLE "message_attachment"
  ADD CONSTRAINT "message_attachment_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

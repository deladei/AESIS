-- The assistant's knowledge corpus.
--
-- The chatbot claimed to answer from CS Department regulations while loading a
-- FAISS index out of /tmp that nothing ever built — and /tmp is wiped on every
-- Render restart, so the retrieval half of the RAG was permanently empty. The
-- corpus now lives here, survives restarts, and the AI service builds its index
-- from it.
--
-- Additive: a new table only.

CREATE TABLE "knowledge_passage" (
  "id"              TEXT NOT NULL,
  "source"          TEXT NOT NULL,
  "section"         TEXT NOT NULL,
  "ordinal"         INTEGER NOT NULL,
  "content"         TEXT NOT NULL,
  "checksum"        TEXT NOT NULL,
  "embedding"       DOUBLE PRECISION[] NOT NULL,
  "embedding_model" TEXT NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "knowledge_passage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_passage_source_ordinal_key" ON "knowledge_passage"("source", "ordinal");
CREATE INDEX "knowledge_passage_source_idx" ON "knowledge_passage"("source");

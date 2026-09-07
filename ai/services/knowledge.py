"""
The assistant's knowledge corpus — ingestion and retrieval.

The chatbot always claimed to answer from CS Department regulations. In fact it
read a FAISS index out of `/tmp` that nothing ever wrote, and `/tmp` is wiped on
every Render restart — so the retrieval half of the RAG was permanently empty
and every answer came from the model's own priors plus a system prompt. This is
the half that was missing.

Design notes:

* **Postgres is the store, not the filesystem.** The corpus survives restarts
  and is the same database the rest of the system already uses.
* **Embeddings are stored, not recomputed at boot.** A cold start should not pay
  to re-embed the whole handbook. `embedding_model` is stored alongside so a
  model change invalidates rows instead of silently mixing vector spaces.
* **Chunking is by heading.** A regulation answer lives under a heading, and a
  heading is also the citation the reader needs ("Submission deadlines"), so the
  natural chunk and the natural citation are the same thing.
* **No FAISS.** At handbook scale (tens of passages) a numpy dot product over
  normalised vectors is exact, has no index to persist, and removes a failure
  mode. FAISS stays where it earns its keep — the plagiarism corpus.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

import numpy as np

from config.settings import settings

# Below this cosine similarity a passage is not evidence, it is noise. Answering
# from a weak match is how a grounded assistant starts inventing regulations.
MIN_SIMILARITY = 0.25
DEFAULT_TOP_K = 4
# Long enough to carry a whole rule, short enough that retrieval stays precise.
MAX_CHUNK_CHARS = 1_200


@dataclass
class Passage:
    section: str
    content: str
    source: str
    similarity: float = 0.0


async def _pool():
    """Imported lazily so chunking — a pure function — never needs a DB driver
    present, and the module can be imported and tested without one."""
    from config.database import get_pg_pool
    return await get_pg_pool()


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunk_markdown(markdown: str) -> list[tuple[str, str]]:
    """Split a document into (section, content) pairs on `##` headings.

    Front matter before the first heading is dropped: it is guidance for whoever
    edits the file, not something the assistant should ever quote back.
    """
    chunks: list[tuple[str, str]] = []
    section = ""
    buf: list[str] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        # Blockquotes are editor notes to a human, never corpus content.
        body = "\n".join(l for l in body.splitlines() if not l.lstrip().startswith(">")).strip()
        if section and body:
            for part in _split_long(body):
                chunks.append((section, part))

    for line in markdown.splitlines():
        heading = re.match(r"^##\s+(.*)$", line)
        if heading:
            flush()
            section = heading.group(1).strip()
            buf = []
            continue
        if line.startswith("# "):
            continue
        buf.append(line)
    flush()
    return chunks


def _split_long(body: str) -> list[str]:
    """Keep a chunk under the size cap, splitting on paragraph boundaries."""
    if len(body) <= MAX_CHUNK_CHARS:
        return [body]
    parts: list[str] = []
    current = ""
    for para in body.split("\n\n"):
        if current and len(current) + len(para) + 2 > MAX_CHUNK_CHARS:
            parts.append(current.strip())
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current.strip():
        parts.append(current.strip())
    return parts


def _embedder():
    """Loaded lazily so importing this module never costs a model load."""
    from services.chatbot import chatbot  # reuses the one SentenceTransformer
    return chatbot.embedder


def _embed(texts: list[str]) -> np.ndarray | None:
    model = _embedder()
    if model is None:
        return None
    vecs = model.encode(texts, normalize_embeddings=True)
    return np.asarray(vecs, dtype=np.float32)


async def ingest(source: str, markdown: str) -> dict:
    """Chunk, embed and upsert a document. Returns what changed.

    Idempotent by (source, ordinal) + checksum: re-running on an unchanged file
    embeds nothing and writes nothing, so this is safe to call on every deploy.
    """
    chunks = chunk_markdown(markdown)
    if not chunks:
        return {"source": source, "passages": 0, "written": 0, "removed": 0, "skipped": 0}

    pool = await _pool()
    async with pool.acquire() as conn:
        existing = {
            r["ordinal"]: r["checksum"]
            for r in await conn.fetch(
                "SELECT ordinal, checksum FROM knowledge_passage "
                "WHERE source = $1 AND embedding_model = $2",
                source, settings.EMBEDDING_MODEL,
            )
        }

        stale = [
            (i, section, content)
            for i, (section, content) in enumerate(chunks)
            if existing.get(i) != _checksum(content)
        ]

        written = 0
        if stale:
            vectors = _embed([c for _, _, c in stale])
            if vectors is None:
                raise RuntimeError("Embedding model unavailable; cannot ingest")
            for (ordinal, section, content), vec in zip(stale, vectors):
                await conn.execute(
                    """
                    INSERT INTO knowledge_passage
                      (id, source, section, ordinal, content, checksum,
                       embedding, embedding_model, created_at, updated_at)
                    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                    ON CONFLICT (source, ordinal) DO UPDATE SET
                      section = EXCLUDED.section,
                      content = EXCLUDED.content,
                      checksum = EXCLUDED.checksum,
                      embedding = EXCLUDED.embedding,
                      embedding_model = EXCLUDED.embedding_model,
                      updated_at = NOW()
                    """,
                    source, section, ordinal, content, _checksum(content),
                    [float(x) for x in vec], settings.EMBEDDING_MODEL,
                )
                written += 1

        # A document that lost sections should lose their passages too, or the
        # assistant keeps citing a rule that has been deleted.
        removed = await conn.execute(
            "DELETE FROM knowledge_passage WHERE source = $1 AND ordinal >= $2",
            source, len(chunks),
        )

    return {
        "source": source,
        "passages": len(chunks),
        "written": written,
        "skipped": len(chunks) - written,
        "removed": int(removed.split()[-1]) if removed else 0,
    }


async def retrieve(question: str, top_k: int = DEFAULT_TOP_K) -> list[Passage]:
    """The passages that actually bear on the question, most relevant first.

    Returns an empty list when nothing clears `MIN_SIMILARITY` — the caller must
    treat that as "I don't have this in the regulations" rather than answering
    anyway.
    """
    if not question.strip():
        return []

    query = _embed([question])
    if query is None:
        return []

    pool = await _pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT source, section, content, embedding FROM knowledge_passage "
            "WHERE embedding_model = $1",
            settings.EMBEDDING_MODEL,
        )
    if not rows:
        return []

    matrix = np.asarray([r["embedding"] for r in rows], dtype=np.float32)
    # Both sides are L2-normalised, so a dot product IS the cosine similarity.
    sims = matrix @ query[0]

    ranked = sorted(zip(rows, sims), key=lambda p: float(p[1]), reverse=True)
    return [
        Passage(
            section=r["section"],
            content=r["content"],
            source=r["source"],
            similarity=round(float(s), 4),
        )
        for r, s in ranked[:top_k]
        if float(s) >= MIN_SIMILARITY
    ]


async def status() -> dict:
    """What the assistant actually knows — so "grounded" is a checkable claim."""
    pool = await _pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT source, COUNT(*) AS n, MAX(updated_at) AS updated "
            "FROM knowledge_passage WHERE embedding_model = $1 GROUP BY source",
            settings.EMBEDDING_MODEL,
        )
    return {
        "embeddingModel": settings.EMBEDDING_MODEL,
        "passages": sum(r["n"] for r in rows),
        "sources": [
            {"source": r["source"], "passages": r["n"],
             "updatedAt": r["updated"].isoformat() if r["updated"] else None}
            for r in rows
        ],
    }

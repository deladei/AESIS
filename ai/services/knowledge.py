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
from urllib.parse import urlparse

import numpy as np

from config.settings import settings

# Below this cosine similarity a passage is not evidence, it is noise. Answering
# from a weak match is how a grounded assistant starts inventing regulations.
MIN_SIMILARITY = 0.25
DEFAULT_TOP_K = 4
# Long enough to carry a whole rule, short enough that retrieval stays precise.
MAX_CHUNK_CHARS = 1_200

# What happened to the corpus at boot, and the last read failure. Kept in memory
# purely so `/health` can say WHY the assistant has nothing to cite — a corpus
# that is silently empty is indistinguishable from one that is silently broken,
# and the difference is the whole diagnosis.
_BOOT: dict[str, str] = {}


def note(key: str, message: str) -> None:
    _BOOT[key] = message


def _database_target() -> str:
    """Which database this service is pointed at, as a provider suffix.

    Enough to catch the failure mode that actually happens — this service and
    the backend drifting onto two different databases after a provider move —
    without publishing a connectable host on an endpoint that needs no key.
    """
    try:
        host = urlparse(settings.POSTGRES_DSN).hostname or ""
    except Exception:
        return "unknown"
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else (host or "unknown")


def _dsn_problem() -> str | None:
    """Name a malformed DSN without printing it.

    Both this and the backend's DATABASE_URL are pasted into a dashboard by
    hand, and the failure that actually happens is a paste that carried
    something extra — a trailing newline, or a second connection string copied
    along with the first. asyncpg then reports it as a bewildering complaint
    about `sslmode`, which is not the parameter anybody typed wrong.

    Returns a short description, or None when nothing obvious is wrong. Never
    returns any part of the credential.
    """
    dsn = settings.POSTGRES_DSN
    if not dsn:
        return "POSTGRES_DSN is empty"
    if dsn != dsn.strip():
        return "POSTGRES_DSN has leading or trailing whitespace"
    if len(re.findall(r"postgres(?:ql)?://", dsn)) > 1:
        return "POSTGRES_DSN contains more than one connection string"
    if re.search(r"\s", dsn):
        return "POSTGRES_DSN contains whitespace in the middle"
    return None


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
    global _SECTIONS
    _SECTIONS = None  # the corpus is about to change; drop the cached headings

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

    try:
        pool = await _pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT source, section, content, embedding FROM knowledge_passage "
                "WHERE embedding_model = $1",
                settings.EMBEDDING_MODEL,
            )
    except Exception as e:  # noqa: BLE001
        # A corpus that cannot be read is "I don't know", not an outage. The
        # caller already turns an empty result into an honest refusal, and that
        # is a far better failure than a missing table taking the entire
        # assistant offline — which is exactly what it did.
        note("retrieve", f"{type(e).__name__}: {e}")
        return []

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


# The section list changes only when a document is re-ingested, so it is cached
# rather than queried on every chat turn.
_SECTIONS: list[str] | None = None


async def sections() -> list[str]:
    """The headings the corpus actually covers.

    Used to answer "what can you help me with?" from what is really in the
    corpus rather than from a hardcoded blurb that drifts the moment a document
    is edited. Fail-soft: no topics is a shorter answer, not an error.
    """
    global _SECTIONS
    if _SECTIONS is not None:
        return _SECTIONS
    try:
        pool = await _pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT section FROM knowledge_passage "
                "WHERE embedding_model = $1 ORDER BY section",
                settings.EMBEDDING_MODEL,
            )
        _SECTIONS = [r["section"] for r in rows]
    except Exception as e:  # noqa: BLE001
        note("sections", f"{type(e).__name__}: {e}")
        return []
    return _SECTIONS


async def status() -> dict:
    """What the assistant actually knows — so "grounded" is a checkable claim.

    Reports a failure rather than raising one. A caller asking "how big is the
    corpus" needs the answer "none, because X", not a 500 that reduces to "no
    idea" by the time it reaches a status dot.
    """
    state: dict = {
        "embeddingModel": settings.EMBEDDING_MODEL,
        "database": _database_target(),
        "dsn": _dsn_problem(),
        "passages": 0,
        "sources": [],
        "boot": _BOOT.get("ingest"),
    }
    try:
        pool = await _pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT source, COUNT(*) AS n, MAX(updated_at) AS updated "
                "FROM knowledge_passage WHERE embedding_model = $1 GROUP BY source",
                settings.EMBEDDING_MODEL,
            )
    except Exception as e:  # noqa: BLE001
        state["error"] = f"{type(e).__name__}: {e}"
        return state

    state["passages"] = sum(r["n"] for r in rows)
    state["sources"] = [
        {"source": r["source"], "passages": r["n"],
         "updatedAt": r["updated"].isoformat() if r["updated"] else None}
        for r in rows
    ]
    return state

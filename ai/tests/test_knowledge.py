"""
The corpus chunker and the retrieval threshold.

These are the two decisions that determine whether "grounded in the
regulations" is true. Chunking decides what a passage — and therefore a
citation — is; the threshold decides when the assistant must admit it does not
know rather than answering from a weak match.

Database-backed paths are exercised in `ingest`/`retrieve` against a real
Postgres elsewhere; what is worth pinning here is the pure logic.
"""
from pathlib import Path

import numpy as np
import pytest

from services import knowledge
from services.knowledge import chunk_markdown, MAX_CHUNK_CHARS, MIN_SIMILARITY


DOC = Path(__file__).resolve().parent.parent / "knowledge" / "cs-internship-regulations.md"


class TestChunking:
    def test_splits_on_h2_and_keeps_the_heading_as_the_citation(self):
        chunks = chunk_markdown(
            "# Title\n\n## First rule\nBody one.\n\n## Second rule\nBody two.\n"
        )
        assert [c[0] for c in chunks] == ["First rule", "Second rule"]
        assert chunks[0][1] == "Body one."

    def test_drops_front_matter_before_the_first_heading(self):
        # Text before any `##` is guidance for whoever edits the file. Quoting
        # it back at a student would be quoting our own notes as regulation.
        chunks = chunk_markdown("Editor preamble nobody should be told.\n\n## Real rule\nBody.\n")
        assert len(chunks) == 1
        assert "preamble" not in chunks[0][1]

    def test_drops_blockquote_editor_notes(self):
        chunks = chunk_markdown("## Rule\n> Note to the editor.\nActual rule text.\n")
        assert chunks[0][1] == "Actual rule text."

    def test_skips_a_heading_with_no_body(self):
        assert chunk_markdown("## Empty\n\n## Real\nBody.\n") == [("Real", "Body.")]

    def test_splits_an_over_long_section_on_paragraph_boundaries(self):
        para = "x" * 500
        body = "\n\n".join([para] * 5)  # ~2.5k chars, over the cap
        chunks = chunk_markdown(f"## Long\n{body}\n")
        assert len(chunks) > 1
        assert all(len(c[1]) <= MAX_CHUNK_CHARS for c in chunks)
        # Every heading keeps its name, so each part still cites correctly.
        assert {c[0] for c in chunks} == {"Long"}

    def test_the_shipped_regulations_document_chunks_cleanly(self):
        # The corpus the assistant actually ships with must be ingestible.
        chunks = chunk_markdown(DOC.read_text(encoding="utf-8"))
        assert len(chunks) >= 10
        assert all(c[0] and c[1] for c in chunks)
        assert all(len(c[1]) <= MAX_CHUNK_CHARS for c in chunks)
        assert "source of truth" not in " ".join(c[1] for c in chunks)


class TestRetrievalThreshold:
    """A weak match must return nothing at all.

    This is the guard that stops a grounded assistant inventing rules: the
    caller treats an empty list as "not in the regulations", so anything that
    leaks a low-similarity passage through becomes a confident wrong answer.
    """

    @pytest.mark.asyncio
    async def test_returns_nothing_for_an_empty_question(self):
        assert await knowledge.retrieve("   ") == []

    @pytest.mark.asyncio
    async def test_returns_nothing_when_the_embedder_is_unavailable(self, monkeypatch):
        monkeypatch.setattr(knowledge, "_embed", lambda _texts: None)
        assert await knowledge.retrieve("when is my report due?") == []

    @pytest.mark.asyncio
    async def test_drops_passages_below_the_similarity_floor(self, monkeypatch):
        query = np.asarray([[1.0, 0.0]], dtype=np.float32)
        monkeypatch.setattr(knowledge, "_embed", lambda _texts: query)

        strong = [1.0, 0.0]                      # cosine 1.0 — clearly relevant
        weak = [MIN_SIMILARITY / 2, 0.99]        # below the floor — noise

        class _Conn:
            async def fetch(self, *_a, **_k):
                return [
                    {"source": "regs", "section": "Relevant", "content": "yes", "embedding": strong},
                    {"source": "regs", "section": "Unrelated", "content": "no", "embedding": weak},
                ]
            async def __aenter__(self): return self
            async def __aexit__(self, *_a): return False

        class _Pool:
            def acquire(self): return _Conn()

        monkeypatch.setattr(knowledge, "_pool", lambda: _async(_Pool()))

        hits = await knowledge.retrieve("anything")
        assert [h.section for h in hits] == ["Relevant"]


async def _async(value):
    return value

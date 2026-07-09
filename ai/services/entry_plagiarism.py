"""
Stateless plagiarism check for the active enrichment pipeline (Path 2).

Two stages, computed per request — no persisted index:
  1. TF-IDF + FAISS cosine over the corpus the Node worker sends with the
     request (catches copy-paste; deterministic, milliseconds at pilot scale).
  2. Sentence-embedding re-rank of the top TF-IDF candidates using the
     chatbot's already-loaded MiniLM model (catches paraphrase; skipped
     fail-open when the model is unavailable — one model in memory, not two).

Statelessness is deliberate: the legacy detector persisted its FAISS index to
/tmp, which Render wipes on every restart — silent false negatives forever
after. Here the caller rebuilds the corpus from Postgres on every check, so a
restart loses nothing.

Advisory only: a flag means "worth comparing side by side", never a verdict.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from config.settings import settings
from utils.text_processing import clean_text

MAX_DOC_CHARS = 8_000
MAX_CORPUS_DOCS = 400
TOP_K = 6
# TF-IDF flag level comes from settings (shared with the legacy detector).
# Embeddings run much hotter than TF-IDF on unrelated text, so the semantic
# flag level is fixed higher.
SEMANTIC_THRESHOLD = 0.82
MAX_REPORTED_MATCHES = 5


class CorpusDoc(BaseModel):
    entry_id: str
    text: str
    same_student: bool = False


class PlagiarismMatch(BaseModel):
    entry_id: str
    similarity: float = Field(ge=0.0, le=1.0)
    tfidf_similarity: float = Field(ge=0.0, le=1.0)
    semantic_similarity: float | None = Field(default=None, ge=0.0, le=1.0)
    same_student: bool


class PlagiarismReport(BaseModel):
    checked: bool
    corpus_size: int = Field(ge=0)
    max_similarity: float = Field(ge=0.0, le=1.0)
    flagged: bool
    matches: list[PlagiarismMatch] = Field(default_factory=list)


def _unchecked(corpus_size: int = 0) -> PlagiarismReport:
    return PlagiarismReport(checked=False, corpus_size=corpus_size, max_similarity=0.0, flagged=False)


def _unit(x: float) -> float:
    """Cosine of near-duplicate vectors can drift past 1.0 in float32 — pin to [0, 1]."""
    return max(0.0, min(1.0, float(x)))


def _semantic_similarities(candidate: str, texts: list[str]) -> list[float] | None:
    """Cosine similarity of the candidate against each text via the chatbot's
    embedder. Returns None (stage skipped) if the model isn't available."""
    try:
        from services.chatbot import chatbot

        if chatbot.embedder is None:
            return None
        vecs = chatbot.embedder.encode(
            [candidate, *texts], normalize_embeddings=True, show_progress_bar=False
        )
        return [_unit(float(vecs[0] @ v)) for v in vecs[1:]]
    except Exception:
        return None  # fail-open: TF-IDF evidence still stands on its own


def check_entry(candidate_text: str, corpus: list[CorpusDoc]) -> PlagiarismReport:
    """Compare one entry's text against the supplied corpus. Never raises —
    any internal failure degrades to an unchecked report."""
    try:
        candidate = clean_text(candidate_text)[:MAX_DOC_CHARS]
        docs = [d for d in corpus[:MAX_CORPUS_DOCS] if clean_text(d.text)]
        if not candidate or not docs:
            return _unchecked(len(docs))

        import faiss
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.preprocessing import normalize

        texts = [clean_text(d.text)[:MAX_DOC_CHARS] for d in docs]

        # Stage 1 — TF-IDF cosine via FAISS inner product on L2-normalised rows.
        vectorizer = TfidfVectorizer(
            max_features=5000, ngram_range=(1, 2), sublinear_tf=True, strip_accents="unicode"
        )
        matrix = vectorizer.fit_transform([*texts, candidate]).toarray().astype("float32")
        matrix = normalize(matrix)
        corpus_vecs, cand_vec = matrix[:-1], matrix[-1:]
        index = faiss.IndexFlatIP(corpus_vecs.shape[1])
        index.add(corpus_vecs)
        k = min(TOP_K, index.ntotal)
        distances, indices = index.search(cand_vec, k)

        top = [
            (int(idx), _unit(dist))
            for dist, idx in zip(distances[0], indices[0])
            if idx >= 0
        ]
        if not top:
            return _unchecked(len(docs))

        # Stage 2 — semantic re-rank of the TF-IDF candidates only.
        semantic = _semantic_similarities(candidate, [texts[i] for i, _ in top])

        matches: list[PlagiarismMatch] = []
        for rank, (i, tfidf_sim) in enumerate(top):
            sem = semantic[rank] if semantic is not None else None
            best = max(tfidf_sim, sem or 0.0)
            if tfidf_sim >= settings.PLAGIARISM_THRESHOLD or (sem or 0.0) >= SEMANTIC_THRESHOLD:
                matches.append(
                    PlagiarismMatch(
                        entry_id=docs[i].entry_id,
                        similarity=round(best, 3),
                        tfidf_similarity=round(tfidf_sim, 3),
                        semantic_similarity=round(sem, 3) if sem is not None else None,
                        same_student=docs[i].same_student,
                    )
                )

        matches.sort(key=lambda m: m.similarity, reverse=True)
        matches = matches[:MAX_REPORTED_MATCHES]
        max_sim = max(
            [m.similarity for m in matches],
            default=max((_unit(s) for _, s in top), default=0.0),
        )

        return PlagiarismReport(
            checked=True,
            corpus_size=len(docs),
            max_similarity=round(max_sim, 3),
            flagged=bool(matches),
            matches=matches,
        )
    except Exception:
        return _unchecked()

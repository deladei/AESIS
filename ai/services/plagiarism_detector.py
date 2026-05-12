"""
Plagiarism detection using TF-IDF + FAISS cosine similarity.
Indexes all submitted logbook entries; checks each new submission against the corpus.
Runs fully locally — no paid APIs.
"""
import os
import pickle
import threading
import numpy as np
import faiss
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from config.settings import settings
from models.schemas import PlagiarismResult
from utils.text_processing import clean_text

INDEX_PATH      = "/tmp/aesis_faiss.index"
METADATA_PATH   = "/tmp/aesis_faiss_meta.pkl"
LOCK            = threading.Lock()


class PlagiarismDetector:
    def __init__(self):
        self.vectorizer   = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            sublinear_tf=True,
            strip_accents="unicode",
        )
        self.index:       faiss.IndexFlatIP | None = None
        self.doc_ids:     list[str] = []       # submission_ids in index order
        self.corpus_texts: list[str] = []      # raw texts for refitting vectorizer
        self._fitted      = False
        self._load()

    # ── Persistence ───────────────────────────────────────────

    def _load(self):
        if os.path.exists(INDEX_PATH) and os.path.exists(METADATA_PATH):
            try:
                self.index = faiss.read_index(INDEX_PATH)
                with open(METADATA_PATH, "rb") as f:
                    meta = pickle.load(f)
                self.vectorizer   = meta["vectorizer"]
                self.doc_ids      = meta["doc_ids"]
                self.corpus_texts = meta["corpus_texts"]
                self._fitted      = True
            except Exception:
                pass  # corrupt cache — start fresh

    def _save(self):
        if self.index:
            faiss.write_index(self.index, INDEX_PATH)
        with open(METADATA_PATH, "wb") as f:
            pickle.dump({
                "vectorizer":    self.vectorizer,
                "doc_ids":       self.doc_ids,
                "corpus_texts":  self.corpus_texts,
            }, f)

    # ── Core API ──────────────────────────────────────────────

    def add_document(self, submission_id: str, text: str):
        """Add a new approved submission to the index."""
        with LOCK:
            if submission_id in self.doc_ids:
                return  # already indexed

            self.corpus_texts.append(clean_text(text))
            self.doc_ids.append(submission_id)
            self._refit()
            self._save()

    def check(self, submission_id: str, text: str) -> PlagiarismResult:
        """Check text against the corpus. Returns similarity + match IDs."""
        with LOCK:
            if not self._fitted or self.index is None or self.index.ntotal == 0:
                return PlagiarismResult(
                    plagiarism_similarity=0.0,
                    is_plagiarism_flagged=False,
                    plagiarism_match_ids=[],
                )

            vec = self._vectorize([clean_text(text)])  # shape (1, dim)
            k   = min(6, self.index.ntotal)
            distances, indices = self.index.search(vec, k)

            match_ids:    list[str]   = []
            max_sim:      float       = 0.0

            for dist, idx in zip(distances[0], indices[0]):
                if idx < 0:
                    continue
                doc_id = self.doc_ids[idx]
                if doc_id == submission_id:
                    continue  # skip self
                sim = float(dist)   # inner product on normalised vectors = cosine
                if sim > max_sim:
                    max_sim = sim
                if sim >= settings.PLAGIARISM_THRESHOLD:
                    match_ids.append(doc_id)

            is_flagged = max_sim >= settings.PLAGIARISM_THRESHOLD

            return PlagiarismResult(
                plagiarism_similarity=round(max_sim, 3),
                is_plagiarism_flagged=is_flagged,
                plagiarism_match_ids=match_ids,
            )

    # ── Internal ──────────────────────────────────────────────

    def _refit(self):
        if not self.corpus_texts:
            return
        matrix = self.vectorizer.fit_transform(self.corpus_texts).toarray().astype("float32")
        matrix = normalize(matrix)  # L2 normalise so inner product = cosine similarity
        dim    = matrix.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(matrix)
        self._fitted = True

    def _vectorize(self, texts: list[str]) -> np.ndarray:
        vecs = self.vectorizer.transform(texts).toarray().astype("float32")
        return normalize(vecs)


detector = PlagiarismDetector()

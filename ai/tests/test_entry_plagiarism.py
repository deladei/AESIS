"""Stateless plagiarism check: TF-IDF stage, semantic re-rank, and every
fail-open edge. check_entry must NEVER raise — a broken check degrades to an
unchecked report, not a failed enrichment."""
import services.entry_plagiarism as ep
from services.entry_plagiarism import CorpusDoc, check_entry

BASE = (
    "This week I refactored the payments API endpoint and fixed a bug in the "
    "database migration. I wrote twelve unit tests and coverage rose to 85 "
    "percent. I also attended the standup meeting and paired on the React frontend."
)
PARAPHRASE = (
    "I refactored the payments API endpoint and fixed a migration bug. Wrote "
    "unit tests, coverage went up. Attended standup, paired on the React frontend."
)
UNRELATED = (
    "Shadowed the accountant, filed paper invoices, organised the storeroom "
    "shelving and watered the office plants before lunch."
)


def corpus():
    return [
        CorpusDoc(entry_id="copy", text=BASE, same_student=False),
        CorpusDoc(entry_id="own-week", text=PARAPHRASE, same_student=True),
        CorpusDoc(entry_id="unrelated", text=UNRELATED, same_student=False),
    ]


class TestTfidfStage:
    def test_verbatim_copy_flags_at_full_similarity(self):
        r = check_entry(BASE, corpus())
        assert r.checked and r.flagged
        top = r.matches[0]
        assert top.entry_id == "copy"
        assert top.tfidf_similarity >= 0.99
        assert top.same_student is False

    def test_paraphrase_of_own_week_flags_and_tags_same_student(self):
        r = check_entry(BASE, corpus())
        own = next(m for m in r.matches if m.entry_id == "own-week")
        assert own.tfidf_similarity >= 0.35
        assert own.same_student is True

    def test_unrelated_text_not_reported(self):
        r = check_entry(BASE, corpus())
        assert all(m.entry_id != "unrelated" for m in r.matches)

    def test_original_work_passes_clean(self):
        r = check_entry(UNRELATED, [c for c in corpus() if c.entry_id != "unrelated"])
        assert r.checked and not r.flagged and r.matches == []
        assert r.max_similarity < 0.35

    def test_matches_sorted_and_capped(self):
        docs = [CorpusDoc(entry_id=f"c{i}", text=BASE, same_student=False) for i in range(8)]
        r = check_entry(BASE, docs)
        assert len(r.matches) <= ep.MAX_REPORTED_MATCHES
        sims = [m.similarity for m in r.matches]
        assert sims == sorted(sims, reverse=True)

    def test_corpus_capped_at_limit(self):
        docs = [CorpusDoc(entry_id=f"c{i}", text=f"{UNRELATED} variant {i}", same_student=False)
                for i in range(ep.MAX_CORPUS_DOCS + 50)]
        r = check_entry(BASE, docs)
        assert r.corpus_size == ep.MAX_CORPUS_DOCS


class TestFailOpenEdges:
    def test_empty_corpus_reports_unchecked(self):
        r = check_entry(BASE, [])
        assert r == ep._unchecked(0)

    def test_empty_candidate_reports_unchecked(self):
        r = check_entry("   ", corpus())
        assert r.checked is False and r.flagged is False

    def test_whitespace_only_corpus_docs_dropped(self):
        r = check_entry(BASE, [CorpusDoc(entry_id="w", text="   ")])
        assert r.checked is False and r.corpus_size == 0

    def test_internal_error_degrades_to_unchecked(self, monkeypatch):
        monkeypatch.setattr(ep, "clean_text", lambda *_: (_ for _ in ()).throw(RuntimeError("boom")))
        r = check_entry(BASE, corpus())
        assert r.checked is False and r.flagged is False


class TestSemanticStage:
    def test_without_embedder_semantic_is_none(self):
        # conftest blocks services.chatbot by default: the import inside
        # _semantic_similarities fails and the stage degrades to None.
        r = check_entry(BASE, corpus())
        assert all(m.semantic_similarity is None for m in r.matches)

    def test_with_embedder_semantic_populates(self, stub_chatbot_embedder):
        r = check_entry(BASE, corpus())
        top = next(m for m in r.matches if m.entry_id == "copy")
        assert top.semantic_similarity is not None
        assert top.semantic_similarity >= ep.SEMANTIC_THRESHOLD
        assert top.similarity == max(top.tfidf_similarity, top.semantic_similarity)

    def test_embedder_crash_keeps_tfidf_evidence(self, monkeypatch, stub_chatbot_embedder):
        def boom(*a, **k):
            raise RuntimeError("model exploded")
        monkeypatch.setattr(stub_chatbot_embedder.embedder, "encode", boom)
        r = check_entry(BASE, corpus())
        assert r.flagged  # TF-IDF stage still stands on its own
        assert all(m.semantic_similarity is None for m in r.matches)

    def test_similarities_stay_unit_bounded(self, stub_chatbot_embedder):
        r = check_entry(BASE, corpus())
        for m in r.matches:
            assert 0.0 <= m.similarity <= 1.0
            assert 0.0 <= m.tfidf_similarity <= 1.0
            if m.semantic_similarity is not None:
                assert 0.0 <= m.semantic_similarity <= 1.0

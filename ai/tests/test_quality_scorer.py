"""clamp_quality_score is the hard boundary the CLAUDE.md rule leans on:
no non-numeric or out-of-range score may ever be persisted."""
import math

from services.quality_scorer import clamp_quality_score, score
from utils.text_processing import count_cs_keywords


class TestClampQualityScore:
    def test_in_range_passes_through(self):
        assert clamp_quality_score(42.5) == (42.5, False)
        assert clamp_quality_score(0) == (0.0, False)
        assert clamp_quality_score(100) == (100.0, False)

    def test_out_of_range_clamps_and_flags(self):
        assert clamp_quality_score(120) == (100.0, True)
        assert clamp_quality_score(-3) == (0.0, True)

    def test_numeric_strings_coerce(self):
        assert clamp_quality_score("55.5") == (55.5, False)

    def test_garbage_returns_none_and_flags(self):
        for bad in (None, "not-a-number", {}, []):
            value, flagged = clamp_quality_score(bad)
            assert value is None
            assert flagged is True

    def test_nan_and_inf_return_none(self):
        for bad in (float("nan"), float("inf"), float("-inf")):
            value, flagged = clamp_quality_score(bad)
            assert value is None
            assert flagged is True


class TestScore:
    RICH_TASKS = (
        "On Monday I refactored the payments API endpoint in Express and fixed a "
        "bug in the PostgreSQL migration. After completing that, I wrote 12 unit "
        "tests and coverage rose to 85 percent. By Friday I had deployed the "
        "Docker container to the staging server and reviewed 3 pull requests."
    )

    def test_all_dimensions_bounded(self):
        r = score(tasks=self.RICH_TASKS, technologies="python docker postgresql express",
                  challenges="Debugging the migration was difficult.",
                  reflection="I learned how database indexing improves query speed. "
                             "In future I would design the schema first.")
        for v in (r.quality_score, r.task_depth_score, r.tech_vocab_score,
                  r.reflection_score, r.temporal_consistency_score):
            assert 0.0 <= v <= 100.0
        assert 0.0 <= r.relevance_score <= 1.0

    def test_empty_input_scores_zero_and_flags_relevance(self):
        r = score(tasks="", technologies="")
        assert r.quality_score == 0.0
        assert r.is_relevance_flagged is True

    def test_overall_is_weighted_composite(self):
        r = score(tasks=self.RICH_TASKS, technologies="python docker",
                  challenges="", reflection="")
        expected = (r.task_depth_score * 0.30 + r.tech_vocab_score * 0.25
                    + r.reflection_score * 0.25 + r.temporal_consistency_score * 0.20)
        assert math.isclose(r.quality_score, round(expected, 2), abs_tol=0.01)

    def test_short_reflection_scores_zero(self):
        r = score(tasks=self.RICH_TASKS, technologies="", reflection="Learned stuff.")
        assert r.reflection_score == 0.0

    def test_cs_relevant_text_not_flagged(self):
        r = score(tasks=self.RICH_TASKS, technologies="python docker postgresql")
        assert r.is_relevance_flagged is False

    def test_feedback_always_present(self):
        assert score(tasks="", technologies="").ai_feedback_summary
        assert score(tasks=self.RICH_TASKS, technologies="python docker",
                     reflection="I learned a great deal about systems and how I "
                                "would approach similar problems going forward in "
                                "future weeks of this internship placement role "
                                "with better planning and more testing discipline "
                                "than before which taught me resilience and the "
                                "value of asking questions early and often indeed").ai_feedback_summary


class TestWholeTermMatching:
    """Vocabulary terms are matched as terms, not as substrings.

    `if kw in text` counted a term whenever its letters appeared anywhere, and
    the vocabulary contains "r", "go", "ci" and "cd". Every entry in English
    therefore scored at least one keyword, and a purely administrative week came
    out at 0.348 CS-relevance — comfortably above the 0.15 flag threshold —
    entirely on the strength of containing the letter r.
    """

    ADMIN_WEEK = (
        "This week I shadowed the operations officer, attended a client meeting "
        "about procurement, updated the office attendance register and helped "
        "organise the storage cupboard. I also assisted with reception duties."
    )

    def test_non_technical_work_scores_no_keywords_and_is_flagged(self):
        assert count_cs_keywords(self.ADMIN_WEEK) == 0
        r = score(tasks=self.ADMIN_WEEK, technologies="")
        assert r.relevance_score == 0.0
        assert r.is_relevance_flagged is True

    def test_technical_work_still_matches(self):
        text = "Wrote a parser in Python and containerised it with Docker for the PostgreSQL loader."
        assert count_cs_keywords(text) >= 3
        assert score(tasks=text, technologies="").is_relevance_flagged is False

    def test_terms_with_non_word_edges_still_match(self):
        # "c++", "c#" and "k8s" are why the boundaries are hand-rolled rather
        # than \b — their edges are not word characters.
        assert count_cs_keywords("Ported the C++ module to C# and deployed on k8s.") == 3

    def test_a_term_embedded_in_a_longer_word_does_not_count(self):
        assert count_cs_keywords("The decision required rigour and goodwill.") == 0

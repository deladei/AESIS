"""clamp_quality_score is the hard boundary the CLAUDE.md rule leans on:
no non-numeric or out-of-range score may ever be persisted."""
import math

from services.quality_scorer import clamp_quality_score, score


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

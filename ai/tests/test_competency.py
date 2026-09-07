"""
Model-based competency classification.

What matters here is not that the model is clever — it is that nothing it
returns is trusted. A competency tag reaches the database and a supervisor's
screen, so the validation layer is the thing worth pinning: off-taxonomy tags
dropped, relevance clamped, a malformed reply falling back to the word list
rather than failing the whole enrichment pass.
"""
import pytest

from services import competency
from services.competency import TAXONOMY, _coerce


class TestCoerce:
    """Everything the model says is treated as untrusted input."""

    def test_keeps_a_well_formed_verdict(self):
        out = _coerce({"activities": [
            {"index": 0, "competencies": ["software_engineering"], "relevance": 0.9, "reason": "wrote a parser"},
        ]}, count=1)
        assert out is not None
        assert out[0].competencies == ["software_engineering"]
        assert out[0].relevance == 0.9

    def test_drops_a_tag_that_is_not_in_the_taxonomy(self):
        # A model inventing "machine_learning" would fragment the cohort's tag
        # counts forever; the closed vocabulary is what keeps them aggregatable.
        out = _coerce({"activities": [
            {"index": 0, "competencies": ["software_engineering", "vibes", "MACHINE_LEARNING"], "relevance": 0.5},
        ]}, count=1)
        assert out[0].competencies == ["software_engineering"]

    @pytest.mark.parametrize("raw,expected", [(1.7, 1.0), (-3, 0.0), ("nonsense", 0.0), (None, 0.0)])
    def test_clamps_relevance_into_range(self, raw, expected):
        out = _coerce({"activities": [{"index": 0, "competencies": [], "relevance": raw}]}, count=1)
        assert out[0].relevance == expected

    def test_drops_an_index_that_does_not_exist(self):
        # Otherwise a hallucinated index attaches a verdict to the wrong day.
        out = _coerce({"activities": [
            {"index": 0, "competencies": ["data"], "relevance": 0.6},
            {"index": 9, "competencies": ["data"], "relevance": 0.6},
        ]}, count=1)
        assert [a.index for a in out] == [0]

    def test_truncates_an_overlong_reason(self):
        out = _coerce({"activities": [
            {"index": 0, "competencies": [], "relevance": 0.1, "reason": "x" * 500},
        ]}, count=1)
        assert len(out[0].reason) == 200

    @pytest.mark.parametrize("payload", [{}, {"activities": "not a list"}, {"activities": []},
                                         {"activities": ["not a dict"]}])
    def test_returns_none_for_an_unusable_reply(self, payload):
        # None is the signal to fall back to the word list, so it has to be
        # returned rather than an empty list that would read as "no competencies".
        assert _coerce(payload, count=2) is None


class TestClassify:
    @pytest.mark.asyncio
    async def test_returns_none_without_an_api_key(self, monkeypatch):
        monkeypatch.setattr(competency.settings, "GROQ_API_KEY", "")
        assert await competency.classify(["Wrote a parser"]) is None

    @pytest.mark.asyncio
    async def test_returns_none_for_no_usable_activities(self, monkeypatch):
        monkeypatch.setattr(competency.settings, "GROQ_API_KEY", "key")
        assert await competency.classify(["", "   "]) is None

    @pytest.mark.asyncio
    async def test_never_raises_when_the_network_fails(self, monkeypatch):
        # Enrichment must survive a dead Groq: the caller needs None, not an
        # exception that takes the whole pass down.
        monkeypatch.setattr(competency.settings, "GROQ_API_KEY", "key")

        class _Boom:
            async def __aenter__(self): return self
            async def __aexit__(self, *_a): return False
            async def post(self, *_a, **_k): raise OSError("network down")

        monkeypatch.setattr(competency.httpx, "AsyncClient", lambda **_k: _Boom())
        assert await competency.classify(["Wrote a parser"]) is None


def test_taxonomy_keys_are_stable_identifiers():
    # These are persisted and aggregated across cohorts, so they must stay
    # snake_case identifiers rather than drifting into prose.
    assert TAXONOMY
    for key in TAXONOMY:
        assert key.islower() and " " not in key and key.replace("_", "").isalnum()

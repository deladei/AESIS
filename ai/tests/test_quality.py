"""
Model-based quality assessment.

The scores here land in a persisted `ai_assessment` row and on a supervisor's
screen, so the validation boundary is what matters: a dimension the model did
not actually judge must never appear as a number, flags stay a closed
vocabulary, and any failure falls back to the rubric rather than losing the
enrichment pass.
"""
import pytest

from services import quality
from services.quality import DIMENSIONS, FLAGS, MAX_EVIDENCE_CHARS, _coerce


def _reply(**over) -> dict:
    base = {d: 50 for d in DIMENSIONS}
    base.update({"evidence": {}, "flags": [], "feedback": ""})
    base.update(over)
    return base


class TestCoerce:
    def test_keeps_a_well_formed_assessment(self):
        out = _coerce(_reply(
            task_depth=82, tech_vocab=64.5, reflection=30, temporal_consistency=71,
            evidence={"task_depth": "names the parser and the config format"},
            flags=["thin_detail"],
            feedback="Ask how the duplicate payments were traced.",
        ))
        assert out.task_depth == 82.0
        assert out.tech_vocab == 64.5
        assert out.evidence["task_depth"] == "names the parser and the config format"
        assert out.flags == ["thin_detail"]

    @pytest.mark.parametrize("raw,expected", [(140, 100.0), (-20, 0.0), ("73", 73.0)])
    def test_clamps_and_coerces_a_dimension(self, raw, expected):
        assert _coerce(_reply(task_depth=raw)).task_depth == expected

    @pytest.mark.parametrize("bad", [None, "not-a-number", float("nan"), float("inf"), {}])
    def test_an_unreadable_dimension_invalidates_the_whole_assessment(self, bad):
        # Not defaulted to zero: a fabricated 0 would show a supervisor a
        # failing dimension the model never judged.
        assert _coerce(_reply(reflection=bad)) is None

    def test_a_missing_dimension_invalidates_the_assessment(self):
        partial = {d: 50 for d in DIMENSIONS if d != "tech_vocab"}
        assert _coerce(partial) is None

    def test_drops_flags_outside_the_vocabulary(self):
        # "needs_more_effort" would put an unfilterable judgement on the record.
        out = _coerce(_reply(flags=["low_cs_relevance", "needs_more_effort", "THIN_DETAIL"]))
        assert out.flags == ["low_cs_relevance"]

    def test_deduplicates_flags(self):
        assert _coerce(_reply(flags=["repetitive", "repetitive"])).flags == ["repetitive"]

    def test_truncates_evidence_and_ignores_unknown_dimensions(self):
        out = _coerce(_reply(evidence={"task_depth": "x" * 900, "made_up": "ignored"}))
        assert len(out.evidence["task_depth"]) == MAX_EVIDENCE_CHARS
        assert set(out.evidence) <= set(DIMENSIONS)

    @pytest.mark.parametrize("shape", ["text", 7, None, ["list"]])
    def test_rejects_a_non_object_reply(self, shape):
        assert _coerce(shape) is None

    @pytest.mark.parametrize("shape", ["not a dict", 5, None])
    def test_tolerates_wrongly_shaped_evidence_and_flags(self, shape):
        out = _coerce(_reply(evidence=shape, flags=shape))
        assert out.evidence == {} and out.flags == []


class TestAssess:
    @pytest.mark.asyncio
    async def test_returns_none_without_an_api_key(self, monkeypatch):
        monkeypatch.setattr(quality.settings, "GROQ_API_KEY", "")
        assert await quality.assess(["Built the exporter"]) is None

    @pytest.mark.asyncio
    async def test_returns_none_with_no_usable_activities(self, monkeypatch):
        monkeypatch.setattr(quality.settings, "GROQ_API_KEY", "key")
        assert await quality.assess(["", "  "]) is None

    @pytest.mark.asyncio
    async def test_never_raises_when_the_network_fails(self, monkeypatch):
        monkeypatch.setattr(quality.settings, "GROQ_API_KEY", "key")

        class _Boom:
            async def __aenter__(self): return self
            async def __aexit__(self, *_a): return False
            async def post(self, *_a, **_k): raise OSError("network down")

        monkeypatch.setattr(quality.httpx, "AsyncClient", lambda **_k: _Boom())
        assert await quality.assess(["Built the exporter"]) is None

    @pytest.mark.asyncio
    async def test_returns_none_on_a_non_200(self, monkeypatch):
        monkeypatch.setattr(quality.settings, "GROQ_API_KEY", "key")

        class _Resp:
            status_code = 500
            @staticmethod
            def json(): return {}

        class _Client:
            async def __aenter__(self): return self
            async def __aexit__(self, *_a): return False
            async def post(self, *_a, **_k): return _Resp()

        monkeypatch.setattr(quality.httpx, "AsyncClient", lambda **_k: _Client())
        assert await quality.assess(["Built the exporter"]) is None


def test_every_prompt_flag_is_in_the_vocabulary():
    # The prompt lists the allowed flags; if the two drift, the model is asked
    # for flags that _coerce then silently drops.
    for flag in FLAGS:
        assert flag in quality.SYSTEM_PROMPT

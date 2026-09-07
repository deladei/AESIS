"""
The model narrates; the code counts.

What is worth pinning here is the boundary, not the prose. A summary reaches a
supervisor's screen next to a table of computed figures, so the tests that
matter are the ones that stop it contradicting that table or reading as a mark:
evaluative language is refused, a broken reply falls back to the template
rather than failing enrichment, and the computed facts survive whatever the
model says.
"""
import pytest

from services import summary
from services.summary import (
    MAX_HEADLINE_CHARS,
    MAX_ITEMS,
    MAX_ITEM_CHARS,
    _clean,
    _clean_items,
    _is_evaluative,
)


class TestEvaluativeGuard:
    """"Never implies a grade" is a hard rule, so it is enforced on the way out
    rather than merely requested in the prompt."""

    @pytest.mark.parametrize("text", [
        "The work would grade well",
        "Marks awarded for the sprint",
        "A distinction-level placement",
        "Scored 82% across the week",
        "Rated 4/5 on delivery",
        "Out of 10 for effort",
        "A pass/fail judgement on the entry",
    ])
    def test_flags_assessment_language(self, text):
        assert _is_evaluative(text)

    @pytest.mark.parametrize("text", [
        "Traced the failing integration tests and fixed the flaky fixture",
        "Built the invoice export and reviewed a colleague's pull request",
        "Spent the week passing session data between two services",
        "Shadowed the deployment and documented the rollback steps",
    ])
    def test_leaves_ordinary_technical_prose_alone(self, text):
        # A guard that trips on "failing tests" would send nearly every real
        # summary back to the template — the feature would be dead on arrival.
        assert not _is_evaluative(text)


class TestCleaning:
    def test_collapses_whitespace_and_bounds_length(self):
        out = _clean("  Built   the\n\nexporter  " + "x" * 500, MAX_HEADLINE_CHARS)
        assert out.startswith("Built the exporter ")
        assert len(out) == MAX_HEADLINE_CHARS

    @pytest.mark.parametrize("raw", [None, 42, {"a": 1}, ["list"]])
    def test_ignores_a_non_string(self, raw):
        assert _clean(raw, 100) == ""

    def test_items_drop_evaluative_entries_without_losing_the_rest(self):
        # One bad item costs that item. The headline is the part worth falling
        # back over; silently dropping three good concerns is not.
        out = _clean_items([
            "Reflection is thin for the amount of work described",
            "Would grade poorly",
            "No mention of testing",
        ])
        assert out == [
            "Reflection is thin for the amount of work described",
            "No mention of testing",
        ]

    def test_items_deduplicate_and_cap(self):
        out = _clean_items([f"concern {i}" for i in range(10)] + ["concern 0"])
        assert len(out) == MAX_ITEMS
        assert len(set(out)) == MAX_ITEMS

    def test_items_are_truncated(self):
        assert len(_clean_items(["y" * 900])[0]) == MAX_ITEM_CHARS

    @pytest.mark.parametrize("raw", [None, "not a list", 7])
    def test_items_tolerate_a_wrong_shape(self, raw):
        assert _clean_items(raw) == []


class TestSummarizeWeek:
    @pytest.mark.asyncio
    async def test_returns_none_without_an_api_key(self, monkeypatch):
        monkeypatch.setattr(summary.settings, "GROQ_API_KEY", "")
        assert await summary.summarize_week(["Built the exporter"]) is None

    @pytest.mark.asyncio
    async def test_returns_none_with_nothing_to_summarize(self, monkeypatch):
        monkeypatch.setattr(summary.settings, "GROQ_API_KEY", "key")
        assert await summary.summarize_week(["", "   "]) is None

    @pytest.mark.asyncio
    async def test_never_raises_when_the_network_fails(self, monkeypatch):
        # Enrichment must survive a dead Groq: the caller needs None so the
        # count-based template still renders.
        monkeypatch.setattr(summary.settings, "GROQ_API_KEY", "key")

        class _Boom:
            async def __aenter__(self): return self
            async def __aexit__(self, *_a): return False
            async def post(self, *_a, **_k): raise OSError("network down")

        monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **_k: _Boom())
        assert await summary.summarize_week(["Built the exporter"]) is None

    @pytest.mark.asyncio
    async def test_keeps_a_well_formed_narrative(self, monkeypatch):
        _stub(monkeypatch, {
            "headline": "Built the invoice exporter and traced a duplicate-payment bug.",
            "concerns": ["No reflection on the debugging approach"],
        })
        out = await summary.summarize_week(["Built the invoice exporter"])
        assert out.headline.startswith("Built the invoice exporter")
        assert out.concerns == ["No reflection on the debugging approach"]

    @pytest.mark.asyncio
    async def test_refuses_an_evaluative_headline_entirely(self, monkeypatch):
        # Not sanitised and shipped: an evaluative headline means the model
        # answered a different question, so the template is the honest output.
        _stub(monkeypatch, {"headline": "Strong week, would grade at a distinction.",
                            "concerns": []})
        assert await summary.summarize_week(["Built the exporter"]) is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize("payload", [{}, {"headline": ""}, {"headline": "   "},
                                         {"headline": None}, ["not a dict"], "text"])
    async def test_falls_back_on_an_unusable_reply(self, monkeypatch, payload):
        _stub(monkeypatch, payload)
        assert await summary.summarize_week(["Built the exporter"]) is None


class TestSummarizePlacement:
    @pytest.mark.asyncio
    async def test_returns_none_with_no_weeks(self, monkeypatch):
        monkeypatch.setattr(summary.settings, "GROQ_API_KEY", "key")
        assert await summary.summarize_placement([]) is None
        assert await summary.summarize_placement([(1, []), (2, ["   "])]) is None

    @pytest.mark.asyncio
    async def test_keeps_a_well_formed_narrative(self, monkeypatch):
        _stub(monkeypatch, {
            "headline": "Began on internal tooling and moved into the payments service.",
            "recommendations": ["Little exposure to automated testing"],
        })
        out = await summary.summarize_placement([(1, ["Set up the dev environment"]),
                                                 (2, ["Wrote the refund handler"])])
        assert "payments service" in out.headline
        assert out.recommendations == ["Little exposure to automated testing"]

    @pytest.mark.asyncio
    async def test_refuses_an_evaluative_headline(self, monkeypatch):
        _stub(monkeypatch, {"headline": "Overall marks would be high.", "recommendations": []})
        assert await summary.summarize_placement([(1, ["Wrote the refund handler"])]) is None


class TestHistoryContext:
    def test_renders_earlier_weeks_oldest_first(self):
        block = summary._history_block([(1, ["Set up the environment"]),
                                        (2, ["Wrote the refund handler"])])
        assert block.index("Week 1") < block.index("Week 2")

    def test_empty_without_history(self):
        assert summary._history_block(None) == ""
        assert summary._history_block([(1, ["  "])]) == ""

    @pytest.mark.asyncio
    async def test_history_reaches_the_model(self, monkeypatch):
        sent = {}
        _stub(monkeypatch, {"headline": "Continued the exporter work.", "concerns": []})
        real = summary._ask

        async def spy(system, user):
            sent["user"] = user
            return await real(system, user)

        monkeypatch.setattr(summary, "_ask", spy)
        await summary.summarize_week(["Finished the exporter"], history=[(4, ["Started the exporter"])])
        assert "Week 4: Started the exporter" in sent["user"]
        assert "context only" in sent["user"].lower()

    def test_the_prompt_forbids_describing_earlier_work_as_this_week(self):
        assert "CONTEXT ONLY" in summary.WEEK_PROMPT


def _stub(monkeypatch, payload) -> None:
    """Pretend Groq answered with `payload`, without a network call."""
    import json

    monkeypatch.setattr(summary.settings, "GROQ_API_KEY", "key")

    class _Resp:
        status_code = 200
        @staticmethod
        def json():
            return {"choices": [{"message": {"content": json.dumps(payload)}}]}

    class _Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *_a): return False
        async def post(self, *_a, **_k): return _Resp()

    monkeypatch.setattr(summary.httpx, "AsyncClient", lambda **_k: _Client())

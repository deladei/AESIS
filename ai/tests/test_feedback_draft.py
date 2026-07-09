"""Groq feedback draft: strictly fail-open, human-in-loop constraints in the
prompt, output length-capped. HTTP is mocked at the httpx.AsyncClient boundary."""
import httpx
import pytest

import services.feedback_draft as fd
from config.settings import settings

ARGS = dict(
    activities=["Built REST API endpoints with Express and wrote unit tests."],
    learning="I learned about middleware.",
    challenges="Async debugging was difficult.",
    rubric_feedback="Use chronological language.",
    concerns=["No reflection provided."],
)


class _MockResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._payload


def mock_client(monkeypatch, handler):
    class _Client:
        def __init__(self, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, **kw):
            return handler(url, kw)

    monkeypatch.setattr(fd.httpx, "AsyncClient", _Client)


async def test_no_api_key_returns_none():
    assert settings.GROQ_API_KEY == ""  # pinned by conftest
    assert await fd.draft_feedback(**ARGS) is None


async def test_success_returns_capped_draft(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    sent = {}

    def handler(url, kw):
        sent["url"] = url
        sent["json"] = kw["json"]
        return _MockResponse({"choices": [{"message": {"content": "  Good work on the API. Next week describe your debugging steps.  "}}]})

    mock_client(monkeypatch, handler)
    draft = await fd.draft_feedback(**ARGS)
    assert draft is not None
    assert draft.text == "Good work on the API. Next week describe your debugging steps."
    assert draft.model == settings.GROQ_MODEL
    assert sent["url"].endswith("/chat/completions")
    assert sent["json"]["stream"] is False


async def test_prompt_carries_human_in_loop_guardrails(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    sent = {}

    def handler(url, kw):
        sent["json"] = kw["json"]
        return _MockResponse({"choices": [{"message": {"content": "ok"}}]})

    mock_client(monkeypatch, handler)
    await fd.draft_feedback(**ARGS)
    system = sent["json"]["messages"][0]["content"]
    # The prompt must forbid grade language and AI attribution — the hard rule
    # that enrichment never implies a grade.
    assert "Never mention grades" in system
    assert "Never" in system and "AI" in system
    user = sent["json"]["messages"][1]["content"]
    assert "Built REST API endpoints" in user
    assert "Use chronological language." in user
    assert "No reflection provided." in user


async def test_long_completion_is_length_capped(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    mock_client(monkeypatch, lambda url, kw: _MockResponse(
        {"choices": [{"message": {"content": "x" * 5000}}]}
    ))
    draft = await fd.draft_feedback(**ARGS)
    assert draft is not None and len(draft.text) == fd.MAX_DRAFT_CHARS


async def test_empty_completion_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    mock_client(monkeypatch, lambda url, kw: _MockResponse({"choices": [{"message": {"content": "   "}}]}))
    assert await fd.draft_feedback(**ARGS) is None


async def test_malformed_payload_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    mock_client(monkeypatch, lambda url, kw: _MockResponse({"unexpected": True}))
    assert await fd.draft_feedback(**ARGS) is None


async def test_http_error_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")
    mock_client(monkeypatch, lambda url, kw: _MockResponse({}, status=500))
    assert await fd.draft_feedback(**ARGS) is None


async def test_network_error_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "gsk_test")

    def handler(url, kw):
        raise httpx.ConnectError("down")

    mock_client(monkeypatch, handler)
    assert await fd.draft_feedback(**ARGS) is None

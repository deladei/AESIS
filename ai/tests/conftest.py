"""
Shared fixtures for the AI-service suite.

The suite runs WITHOUT the heavyweight deps of the deploy image: no
sentence-transformers/torch (the semantic plagiarism stage is exercised via a
stub chatbot module) and no live Postgres/Mongo/Redis/Groq. Everything under
test is pure logic + HTTP mocked at the client boundary.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

# Make `routers.*` / `services.*` importable when pytest is launched from the
# repo root as well as from ai/.
AI_ROOT = str(Path(__file__).resolve().parent.parent)
if AI_ROOT not in sys.path:
    sys.path.insert(0, AI_ROOT)

from config.settings import settings  # noqa: E402


TEST_API_KEY = "test-internal-key"


@pytest.fixture(autouse=True)
def pinned_settings(monkeypatch):
    """Tests never depend on a developer's .env: pin every consumed setting."""
    monkeypatch.setattr(settings, "AI_API_KEY", TEST_API_KEY)
    monkeypatch.setattr(settings, "PLAGIARISM_THRESHOLD", 0.35)
    monkeypatch.setattr(settings, "GROQ_API_KEY", "")  # tests opt in explicitly
    monkeypatch.setattr(settings, "GROQ_BASE_URL", "https://groq.test/openai/v1")
    monkeypatch.setattr(settings, "GROQ_MODEL", "llama-3.1-8b-instant")


@pytest.fixture(autouse=True)
def no_real_embedder(monkeypatch):
    """Force `from services.chatbot import chatbot` to fail by default so the
    semantic stage degrades identically everywhere — CI installs the full
    requirements (sentence-transformers present), the dev box doesn't. Tests
    that want the stage opt in via stub_chatbot_embedder, which overrides this
    entry after the autouse fixtures run."""
    monkeypatch.setitem(sys.modules, "services.chatbot", None)


class _StubEmbedder:
    """Deterministic stand-in for the MiniLM model: token-set bag vectors over
    a vocabulary built per call, L2-normalised so dot = cosine. Identical text
    → 1.0; disjoint text → 0.0; overlap in between. Enough to exercise the
    semantic thresholds without torch."""

    def encode(self, texts, normalize_embeddings=True, show_progress_bar=False):
        token_sets = [set(t.lower().split()) for t in texts]
        vocab = sorted(set().union(*token_sets)) or ["_"]
        idx = {w: i for i, w in enumerate(vocab)}
        out = np.zeros((len(texts), len(vocab)), dtype="float32")
        for r, toks in enumerate(token_sets):
            for w in toks:
                out[r, idx[w]] = 1.0
            norm = np.linalg.norm(out[r])
            if norm:
                out[r] /= norm
        return out


@pytest.fixture
def stub_chatbot_embedder(monkeypatch):
    """Inject a fake services.chatbot module so the semantic plagiarism stage
    runs. Without this fixture the import fails on this box (no
    sentence-transformers) and the stage correctly degrades to None."""
    import types

    mod = types.ModuleType("services.chatbot")
    mod.chatbot = types.SimpleNamespace(embedder=_StubEmbedder())
    monkeypatch.setitem(sys.modules, "services.chatbot", mod)
    return mod.chatbot

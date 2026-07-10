"""Boot-import smoke tests.

The unit suite exercises pure logic and never imports the DB stack, so a broken
dependency resolution (e.g. an unpinned pymongo drifting past what motor
supports) sails through tests and crashes only at deploy boot. These tests
import the real modules wherever the dependency is installed — the full
requirements in CI — and skip on the slim dev box.
"""
import pytest


def test_config_database_imports():
    pytest.importorskip("motor", reason="full requirements not installed")
    import config.database  # noqa: F401 — motor/pymongo compatibility


def test_app_boot_imports(stub_chatbot_embedder):
    # stub_chatbot_embedder satisfies routers.chat's module-level
    # `from services.chatbot import chatbot` without torch/HF downloads.
    pytest.importorskip("motor", reason="full requirements not installed")
    import main  # noqa: F401 — the same import uvicorn performs at deploy

    assert {r.path for r in main.app.routes} >= {"/ai/enrich/entry", "/ai/chat", "/health"}

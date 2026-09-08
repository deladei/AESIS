"""What `/health` says about the chat-history store.

`MONGO_URI` is set separately on this service and on the backend (both
`sync: false` in render.yaml), so the two drift and transcripts silently stop
being saved. The health endpoint used to report only the exception class name,
which named the failure without giving anyone a way to act on it.

The rule these tests hold: say what is wrong, never publish the credential.
"""
import pytest

from config.mongo_diagnostics import mongo_target
from config.settings import settings


@pytest.fixture
def uri(monkeypatch):
    def _set(value):
        monkeypatch.setattr(settings, "MONGO_URI", value)
        return mongo_target()
    return _set


def test_reports_host_and_database_for_a_good_uri(uri):
    out = uri("mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/aesis?retryWrites=true")
    assert out["configured"] is True
    assert out["host"] == "mongodb.net"
    assert out["database"] == "aesis"
    assert out["hasPassword"] is True
    assert out["problem"] is None


def test_never_publishes_the_password(uri):
    out = uri("mongodb+srv://aesis:SuperSecret123@cluster0.abcd.mongodb.net/aesis")
    assert "SuperSecret123" not in repr(out)
    # The username is a credential half too.
    assert "aesis:" not in repr(out)


def test_names_a_missing_database(uri):
    # get_default_database() needs one; without it every read fails before the
    # credential is ever tested, which reads as an auth problem and is not.
    out = uri("mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/?retryWrites=true")
    assert out["database"] == "(none)"
    assert "names no database" in out["problem"]


def test_names_a_pasted_newline(uri):
    # Mongo reports this as an auth failure, which sends everyone looking at
    # the password instead of the paste.
    out = uri("mongodb+srv://aesis:s3cret@cluster0.abcd.mongodb.net/aesis\n")
    assert "whitespace" in out["problem"]


def test_names_a_missing_password(uri):
    out = uri("mongodb+srv://aesis@cluster0.abcd.mongodb.net/aesis")
    assert out["hasPassword"] is False
    assert "no password" in out["problem"]


def test_reports_an_empty_setting_as_unconfigured(uri):
    out = uri("")
    assert out["configured"] is False
    assert "empty" in out["problem"]


def test_survives_something_that_is_not_a_uri(uri):
    # A diagnostic that throws is worse than the failure it describes.
    out = uri("not-a-uri")
    assert out["configured"] is True
    assert out["problem"] is not None

"""What is wrong with MONGO_URI, said in a way someone can act on.

Split out of `database.py` for the same reason `chat_prompt.py` was split out
of `chatbot.py`: this is a pure function over a string, and importing it should
not drag in asyncpg and motor. That is what made it testable.
"""
from urllib.parse import urlparse

from config.settings import settings


def mongo_target() -> dict:
    """Where this service thinks its chat history lives, and what looks wrong.

    Same purpose as `knowledge._database_target` / `_dsn_problem` on the
    Postgres side, and for the same reason: `MONGO_URI` is `sync: false` on
    BOTH this service and the backend (render.yaml:33 and :144), so the two are
    typed into a dashboard separately and drift apart. When they do, `/health`
    said only "unavailable: OperationFailure", which names the exception class
    and nothing a person can act on.

    Publishes the host suffix and the database name — enough to see the two
    services pointing at different places — and never any part of the
    credential.
    """
    raw = (settings.MONGO_URI or "").strip()
    if not raw:
        return {"configured": False, "problem": "MONGO_URI is empty"}

    try:
        parsed = urlparse(raw)
    except Exception:
        return {"configured": True, "problem": "MONGO_URI is not a parseable URI"}

    host = parsed.hostname or ""
    suffix = ".".join(host.split(".")[-2:]) if host.count(".") >= 1 else host
    database = (parsed.path or "").lstrip("/").split("?")[0]

    problem = None
    if raw != settings.MONGO_URI:
        # The paste that carried a newline. Mongo reports this as an auth
        # failure, which sends everyone looking at the password instead.
        problem = "MONGO_URI has leading or trailing whitespace"
    elif not database:
        # `get_default_database()` needs one; without it every read raises
        # before the credential is ever tested.
        problem = "MONGO_URI names no database (add /<dbname> before the ?)"
    elif not parsed.password:
        problem = "MONGO_URI carries no password"

    return {
        "configured": True,
        "host": suffix or "unknown",
        "database": database or "(none)",
        "hasPassword": bool(parsed.password),
        "problem": problem,
    }

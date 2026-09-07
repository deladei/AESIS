from datetime import datetime, timezone

from fastapi import APIRouter
import httpx
from config.settings import settings
from config.database import get_motor_db
from services import knowledge
from services.chatbot import ChatbotService

# When this process started. An env-var change on Render is supposed to restart
# the service, and when it appears not to have taken effect the first question is
# whether the service restarted at all and read the old value, or never restarted.
# Without this the two are indistinguishable from outside, which cost most of an
# afternoon.
_STARTED_AT = datetime.now(timezone.utc)

router = APIRouter()


@router.get("/health")
async def health():
    # "Connected" was never the question worth answering. This probe hit
    # /models and reported success while every actual completion returned 404,
    # because a reachable Groq with a valid key still refuses a model that no
    # longer exists — and every caller fails open, so nothing surfaced. The
    # configured model is now checked against the list, and the available ids
    # are reported so the fix does not require guessing.
    model_status = "unknown"
    available: list[str] = []

    if not settings.GROQ_API_KEY:
        groq_status = "not configured — chatbot in fallback mode"
    else:
        groq_status = "unreachable — chatbot in fallback mode"
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    f"{settings.GROQ_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                )
                if r.status_code == 200:
                    groq_status = "connected"
                    available = sorted(
                        m.get("id", "") for m in (r.json().get("data") or []) if m.get("id")
                    )
                    model_status = (
                        "available" if settings.GROQ_MODEL in available
                        else f"NOT AVAILABLE — set GROQ_MODEL to one of the listed ids"
                    )
                elif r.status_code == 401:
                    groq_status = "invalid GROQ_API_KEY — chatbot in fallback mode"
        except Exception:
            pass

    # The corpus is reported here, on the endpoint that needs no key, because
    # this is the question an operator actually has to answer at 2am: the
    # assistant said it could not help — is Groq down, or does it simply have
    # nothing to cite, and if so why? `database` is the provider suffix only
    # (e.g. "supabase.com"), which is what catches this service and the backend
    # drifting onto two different databases after a provider move.
    corpus = await knowledge.status()

    # Chat history lives in Mongo. It is not needed to answer a question — the
    # chat endpoint degrades to "first turn" without it — but an unreachable
    # history store silently loses every transcript, so it is worth seeing.
    try:
        db = await get_motor_db()
        await db.command("ping")
        mongo = "connected"
    except Exception as e:
        mongo = f"unavailable: {type(e).__name__}"

    return {
        "status":      "ok",
        "service":     "aesis-ai",
        "groq":        groq_status,
        "mongo":       mongo,
        "model":       settings.GROQ_MODEL,
        "modelStatus": model_status,
        "modelsAvailable": available,
        "environment": settings.ENVIRONMENT,
        "startedAt": _STARTED_AT.isoformat(),
        "uptimeSeconds": int((datetime.now(timezone.utc) - _STARTED_AT).total_seconds()),
        # Why the last chat turn failed, if one did. Cleared by nothing: a stale
        # entry with an old timestamp is still the most recent evidence there is.
        "lastChatFailure": ChatbotService.last_failure,
        "knowledge": {
            "passages": corpus["passages"],
            "sources":  [s["source"] for s in corpus["sources"]],
            "database": corpus["database"],
            # Names a mis-pasted connection string, without printing any of it.
            "dsn": corpus.get("dsn"),
            "boot":     corpus.get("boot"),
            "error":    corpus.get("error"),
        },
    }

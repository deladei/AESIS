from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.database import get_pg_pool, close_connections
from routers import health, chat, enrich, assist, knowledge


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — warm up the DB pool. Fail-soft: enrichment, the writing assist
    # and the feedback drafts are stateless Groq calls that need no database, so
    # a Postgres blip must not turn into "the AI engine is down". The paths that
    # do need it degrade individually.
    from services import knowledge
    try:
        await get_pg_pool()
    except Exception as e:  # noqa: BLE001
        knowledge.note("pool", f"{type(e).__name__}: {e}")
        print(f"[startup] Postgres unavailable: {e}")
    await _ingest_bundled_knowledge()
    yield
    # Shutdown
    await close_connections()


async def _ingest_bundled_knowledge() -> None:
    """Load `knowledge/*.md` into the assistant's corpus on boot.

    Ingestion is idempotent — passages are keyed on (source, ordinal) and
    skipped when their content hash is unchanged — so a normal restart embeds
    nothing and writes nothing, and a deploy that edited a document picks up
    exactly the changed sections.

    Deliberately fail-soft: a corpus problem must never stop the engine from
    booting. Enrichment, the feedback drafts and the writing assist do not
    depend on it, and a chat with no corpus already says it cannot answer rather
    than improvising.
    """
    from pathlib import Path
    from services import knowledge

    docs_dir = Path(__file__).resolve().parent / "knowledge"
    if not docs_dir.is_dir():
        print("[knowledge] no knowledge/ directory; assistant has no corpus")
        return

    for path in sorted(docs_dir.glob("*.md")):
        try:
            result = await knowledge.ingest(path.stem, path.read_text(encoding="utf-8"))
            summary = (
                f"{result['source']}: {result['passages']} passages "
                f"({result['written']} written, {result['skipped']} unchanged)"
            )
            knowledge.note("ingest", summary)
            print(f"[knowledge] {summary}")
        except Exception as e:  # noqa: BLE001 — boot must not depend on this
            # Recorded as well as printed: Render's logs roll, and the question
            # "why is the assistant citing nothing?" is asked long afterwards.
            knowledge.note("ingest", f"failed: {type(e).__name__}: {e}")
            print(f"[knowledge] failed to ingest {path.name}: {e}")


app = FastAPI(
    title="AESIS AI Engine",
    description="AI analysis pipeline for the AESIS internship supervision system.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Node backend only
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(enrich.router)
app.include_router(assist.router)
app.include_router(knowledge.router)

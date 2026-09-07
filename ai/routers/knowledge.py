"""Ingest and inspect the assistant's regulation corpus."""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import settings
from services import knowledge

router = APIRouter(prefix="/ai", tags=["knowledge"])


def _require_internal(x_api_key: str | None) -> None:
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class IngestRequest(BaseModel):
    """`source` names the document so re-ingesting replaces it in place rather
    than appending a second copy."""
    source: str = Field(min_length=1, max_length=120)
    markdown: str = Field(min_length=1, max_length=1_000_000)


@router.post("/knowledge/ingest")
async def ingest_document(body: IngestRequest, x_api_key: str | None = Header(default=None)):
    _require_internal(x_api_key)
    try:
        return await knowledge.ingest(body.source, body.markdown)
    except RuntimeError as e:
        # The embedding model failing is an operational problem, not a bad
        # request — say which so nobody debugs the document.
        raise HTTPException(status_code=503, detail=str(e)) from e


@router.get("/knowledge/status")
async def knowledge_status(x_api_key: str | None = Header(default=None)):
    """What the assistant actually knows, so "grounded in regulations" is a
    claim anyone can check rather than one we simply make."""
    _require_internal(x_api_key)
    return await knowledge.status()


class SearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1_000)
    top_k: int = Field(default=knowledge.DEFAULT_TOP_K, ge=1, le=10)


@router.post("/knowledge/search")
async def search(body: SearchRequest, x_api_key: str | None = Header(default=None)):
    """Retrieval on its own — what the model WOULD be shown for a question.

    Exists so a wrong answer can be diagnosed: it separates "retrieved the wrong
    passage" from "retrieved the right passage and answered badly".
    """
    _require_internal(x_api_key)
    hits = await knowledge.retrieve(body.question, top_k=body.top_k)
    return {
        "question": body.question,
        "matches": [
            {"section": h.section, "source": h.source,
             "similarity": h.similarity, "content": h.content}
            for h in hits
        ],
    }

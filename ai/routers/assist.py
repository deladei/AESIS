"""Student-facing writing assistance for a daily logbook entry."""
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import settings
from services.entry_assist import draft_entry, EntryAssist

router = APIRouter(prefix="/ai", tags=["assist"])


def _require_internal(x_api_key: str | None) -> None:
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


class AssistRequest(BaseModel):
    notes: str = Field(default="", max_length=8_000)
    skills: str = Field(default="", max_length=8_000)
    week_number: int | None = None


class AssistResponse(BaseModel):
    """`available` is false when the model could not be reached — the caller
    shows nothing rather than an error, exactly as the enrichment path does."""
    available: bool
    text: str | None = None
    questions: list[str] = []
    model: str | None = None


@router.post("/assist/day-entry", response_model=AssistResponse)
async def assist_day_entry(
    body: AssistRequest,
    x_api_key: str | None = Header(default=None),
) -> AssistResponse:
    _require_internal(x_api_key)

    result: EntryAssist | None = await draft_entry(
        notes=body.notes,
        skills=body.skills,
        week_number=body.week_number,
    )
    if result is None:
        return AssistResponse(available=False)

    return AssistResponse(
        available=True,
        text=result.text,
        questions=result.questions,
        model=result.model,
    )

from fastapi import APIRouter, HTTPException, Header
from config.settings import settings
from models.schemas import AnalyzeLogbookRequest
from tasks.analysis_tasks import analyze_logbook

router = APIRouter(prefix="/ai", tags=["analysis"])


def _require_internal(x_api_key: str | None = Header(default=None)):
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post("/analyze/logbook")
async def trigger_logbook_analysis(
    body: AnalyzeLogbookRequest,
    x_api_key: str | None = Header(default=None),
):
    _require_internal(x_api_key)
    task = analyze_logbook.delay(
        submission_id=body.submission_id,
        student_id=body.student_id,
        placement_id=body.placement_id,
    )
    return {"task_id": task.id, "status": "queued"}


@router.get("/analyze/logbook/{task_id}/status")
async def get_analysis_status(
    task_id: str,
    x_api_key: str | None = Header(default=None),
):
    _require_internal(x_api_key)
    from tasks.celery_app import celery_app
    result = celery_app.AsyncResult(task_id)
    return {"task_id": task_id, "state": result.state}

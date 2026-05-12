from fastapi import APIRouter, HTTPException, Header
from config.settings import settings
from models.schemas import RiskPredictRequest
from tasks.analysis_tasks import compute_risk
from utils.feature_extraction import extract_features
from services.risk_predictor import predictor

router = APIRouter(prefix="/ai", tags=["risk"])


def _require_internal(x_api_key: str | None):
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


@router.post("/predict/risk")
async def trigger_risk_prediction(
    body: RiskPredictRequest,
    x_api_key: str | None = Header(default=None),
):
    _require_internal(x_api_key)
    task = compute_risk.delay(
        student_id=body.student_id,
        placement_id=body.placement_id,
    )
    return {"task_id": task.id, "status": "queued"}


@router.get("/predict/risk/preview")
async def preview_risk(
    student_id: str,
    placement_id: str,
    x_api_key: str | None = Header(default=None),
):
    """Synchronous preview — returns risk result immediately without persisting."""
    _require_internal(x_api_key)
    try:
        features = extract_features(student_id, placement_id)
        result   = predictor.predict(features)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

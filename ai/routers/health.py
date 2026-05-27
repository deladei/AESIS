from fastapi import APIRouter
import httpx
from config.settings import settings

router = APIRouter()


@router.get("/health")
async def health():
    if not settings.GROQ_API_KEY:
        groq_status = "not configured — chatbot in fallback mode"
    else:
        groq_status = "unreachable — chatbot in fallback mode"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                r = await client.get(
                    f"{settings.GROQ_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                )
                if r.status_code == 200:
                    groq_status = "connected"
                elif r.status_code == 401:
                    groq_status = "invalid GROQ_API_KEY — chatbot in fallback mode"
        except Exception:
            pass

    return {
        "status":      "ok",
        "service":     "aesis-ai",
        "groq":        groq_status,
        "model":       settings.GROQ_MODEL,
        "environment": settings.ENVIRONMENT,
    }

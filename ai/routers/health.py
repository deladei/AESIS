from fastapi import APIRouter
import httpx
from config.settings import settings

router = APIRouter()


@router.get("/health")
async def health():
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{settings.OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
    except Exception:
        pass

    return {
        "status":      "ok",
        "service":     "aesis-ai",
        "ollama":      "connected" if ollama_ok else "unavailable — chatbot in fallback mode",
        "model":       settings.OLLAMA_MODEL,
        "environment": settings.ENVIRONMENT,
    }

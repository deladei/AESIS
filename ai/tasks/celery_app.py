from celery import Celery
from config.settings import settings

celery_app = Celery(
    "aesis_ai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.analysis_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "tasks.analysis_tasks.analyze_logbook": {"queue": "analysis"},
        "tasks.analysis_tasks.compute_risk":    {"queue": "risk"},
    },
)

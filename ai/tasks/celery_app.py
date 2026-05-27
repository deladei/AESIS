from celery import Celery
from config.settings import settings

celery_app = Celery(
    "aesis_ai",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["tasks.analysis_tasks"],
)

# Namespace ALL Celery-managed Redis keys (queues, results, kombu bindings, …)
# under `aesis:` so this worker can share a Redis instance with other projects.
# Without this, the generic queue names `analysis` and `risk` would collide
# with any other Celery app on the same broker.
_REDIS_KEY_PREFIX = {"global_keyprefix": "aesis:"}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_transport_options=_REDIS_KEY_PREFIX,
    result_backend_transport_options=_REDIS_KEY_PREFIX,
    task_routes={
        "tasks.analysis_tasks.analyze_logbook": {"queue": "analysis"},
        "tasks.analysis_tasks.compute_risk":    {"queue": "risk"},
    },
)

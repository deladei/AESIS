"""
Weekly logbook entry enrichment — the ONE model of the new (Postgres-only)
logbook pipeline.

Contract with the Node worker (backend/src/modules/entries/enrichment.*.ts):
- Synchronous. No Celery, no broker — the new pipeline is table-as-queue on the
  Node side; this endpoint just does the work inline and returns.
- Exactly one model, run in two stages:
    1. classify  — score each activity's relevance/quality vs a CS competency
                   vocabulary (free, local, deterministic — no training data).
    2. summarize — fold the per-activity signal into a short supervisor summary.
- Output is schema-validated by FastAPI (response_model). The Node side
  ALSO validates; an unparseable/invalid response degrades to "no assessment"
  there and never blocks human review.

This is advisory only. It must never imply a grade or a pass/fail.
"""
from __future__ import annotations

import re
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import settings
from services.entry_plagiarism import CorpusDoc, PlagiarismReport, check_entry
from services.feedback_draft import FeedbackDraft, draft_feedback
from services.quality_scorer import clamp_quality_score, score as compute_quality

router = APIRouter(prefix="/ai", tags=["enrich"])

MODEL_NAME = "aesis-entry-enrichment/v2"

# A small, transparent CS competency vocabulary. Deliberately not an LLM: at
# pilot scale a keyword classifier is explainable to a defense panel and has no
# cost, no cold start, and no failure mode beyond "low signal".
CS_VOCAB: dict[str, list[str]] = {
    "software_engineering": [
        "api", "endpoint", "backend", "frontend", "function", "class", "module",
        "refactor", "bug", "debug", "deploy", "build", "feature", "code", "review",
    ],
    "data": [
        "database", "sql", "query", "schema", "migration", "index", "table",
        "dataset", "etl", "pipeline", "model", "analytics", "report",
    ],
    "testing_quality": [
        "test", "unit", "integration", "coverage", "ci", "lint", "qa", "validation",
    ],
    "devops_infra": [
        "docker", "container", "server", "cloud", "aws", "nginx", "redis",
        "kubernetes", "monitoring", "log", "configuration",
    ],
    "collaboration": [
        "meeting", "standup", "documentation", "ticket", "requirement",
        "stakeholder", "presentation", "pair", "git", "branch", "merge",
    ],
}
_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.-]*")


# ── Request / response schemas (the validated contract) ──────────────────────
class ActivityIn(BaseModel):
    description: str
    competency_tags: list[str] = Field(default_factory=list)
    activity_date: str | None = None


class ReflectionIn(BaseModel):
    learning: str = ""
    challenges: str = ""


class EnrichEntryRequest(BaseModel):
    entry_id: str
    week_number: int | None = None
    activities: list[ActivityIn] = Field(default_factory=list)
    reflection: ReflectionIn | None = None
    # Plagiarism corpus: other entries' text, built by the Node worker from
    # Postgres on every check (stateless — nothing survives a restart to go
    # stale). Each doc's text must be composed the same way _entry_text()
    # composes the candidate. Empty list ⇒ plagiarism stage reports unchecked.
    corpus: list[CorpusDoc] = Field(default_factory=list)


class ActivityRelevance(BaseModel):
    description: str
    relevance: float = Field(ge=0.0, le=1.0)
    on_topic: bool
    themes: list[str] = Field(default_factory=list)


class EntrySummary(BaseModel):
    headline: str
    themes: list[str] = Field(default_factory=list)
    activity_relevance: list[ActivityRelevance] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)


class QualityBreakdown(BaseModel):
    """Rubric-based quality scores, all on a uniform 0–100 scale. Advisory only —
    these inform the supervisor's read of an entry, never a grade."""

    overall: float = Field(ge=0.0, le=100.0)
    task_depth: float = Field(ge=0.0, le=100.0)
    tech_vocab: float = Field(ge=0.0, le=100.0)
    reflection: float = Field(ge=0.0, le=100.0)
    temporal_consistency: float = Field(ge=0.0, le=100.0)
    relevance: float = Field(ge=0.0, le=100.0)
    flags: list[str] = Field(default_factory=list)
    feedback: str = ""


class EnrichEntryResponse(BaseModel):
    model_name: str
    relevance: float = Field(ge=0.0, le=1.0)
    summary: EntrySummary
    quality: QualityBreakdown
    plagiarism: PlagiarismReport
    # Human-in-loop: a draft for the SUPERVISOR to edit before sending — never
    # shown to the student as-is. None whenever Groq is unconfigured or down.
    feedback_draft: FeedbackDraft | None = None


def _require_internal(x_api_key: str | None) -> None:
    if x_api_key != settings.AI_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── Stage 1 — classify a single activity ─────────────────────────────────────
def _classify_activity(text: str, tags: list[str]) -> ActivityRelevance:
    tokens = {t.lower() for t in _WORD_RE.findall(text)}
    matched_themes: list[str] = []
    hits = 0
    for theme, words in CS_VOCAB.items():
        overlap = tokens.intersection(words)
        if overlap:
            matched_themes.append(theme)
            hits += len(overlap)
    # Author-supplied competency tags count as soft evidence.
    hits += min(len(tags), 3)
    # Saturating score: ~3 distinct technical signals reads as solidly on-topic.
    relevance = min(1.0, hits / 3.0)
    return ActivityRelevance(
        description=text[:140],
        relevance=round(relevance, 3),
        on_topic=relevance >= 0.34,
        themes=matched_themes,
    )


# ── Canonical entry text (candidate side of the plagiarism check) ────────────
def _entry_text(activities: list[ActivityIn], reflection: ReflectionIn | None) -> str:
    """One flat text per entry. The Node worker composes corpus docs from the
    same fields in the same order so candidate and corpus are comparable."""
    parts = [a.description for a in activities]
    if reflection:
        parts += [reflection.learning, reflection.challenges]
    return " ".join(p for p in parts if p)


# ── Quality rubric — reuses the shared heuristic scorer ──────────────────────
def _bounded(raw: float) -> float:
    """Coerce a rubric score into [0, 100]. The scorer is bounded by construction;
    this is the boundary guard so an out-of-range value can never leave the API
    (response_model would 500, and the Node side degrades to no assessment)."""
    clamped, _ = clamp_quality_score(raw)
    return clamped if clamped is not None else 0.0


def _score_quality(req: EnrichEntryRequest) -> QualityBreakdown:
    """Map the weekly-entry shape onto the rubric scorer's legacy field contract:
    activity descriptions are the 'tasks' narrative, author competency tags stand
    in for the 'technologies' list, and the reflection splits into learning
    (reflection rubric) and challenges (feeds task depth)."""
    tasks = " ".join(a.description for a in req.activities)
    technologies = " ".join(sorted({t for a in req.activities for t in a.competency_tags}))
    challenges = req.reflection.challenges if req.reflection else ""
    learning = req.reflection.learning if req.reflection else ""

    q = compute_quality(
        tasks=tasks,
        technologies=technologies,
        challenges=challenges,
        reflection=learning,
    )

    flags: list[str] = []
    if q.is_relevance_flagged:
        flags.append("low_cs_relevance")

    return QualityBreakdown(
        overall=_bounded(q.quality_score),
        task_depth=_bounded(q.task_depth_score),
        tech_vocab=_bounded(q.tech_vocab_score),
        reflection=_bounded(q.reflection_score),
        temporal_consistency=_bounded(q.temporal_consistency_score),
        relevance=_bounded(q.relevance_score * 100),
        flags=flags,
        feedback=q.ai_feedback_summary,
    )


# ── Stage 2 — summarize the week ─────────────────────────────────────────────
def _summarize(req: EnrichEntryRequest, scored: list[ActivityRelevance]) -> EntrySummary:
    n = len(scored)
    on_topic = sum(1 for a in scored if a.on_topic)
    themes = sorted({t for a in scored for t in a.themes})

    if n == 0:
        headline = "No activities recorded for this week."
    else:
        headline = f"{n} activit{'y' if n == 1 else 'ies'} logged; {on_topic} clearly CS-relevant."

    concerns: list[str] = []
    off_topic = [a for a in scored if not a.on_topic]
    if off_topic:
        concerns.append(
            f"{len(off_topic)} activit{'y' if len(off_topic) == 1 else 'ies'} show little "
            "technical/CS signal — worth confirming with the student."
        )
    if req.reflection is None or not (req.reflection.learning or req.reflection.challenges):
        concerns.append("No reflection provided.")

    return EntrySummary(
        headline=headline,
        themes=themes,
        activity_relevance=scored,
        concerns=concerns,
    )


@router.post("/enrich/entry", response_model=EnrichEntryResponse)
async def enrich_entry(
    body: EnrichEntryRequest,
    x_api_key: str | None = Header(default=None),
) -> EnrichEntryResponse:
    _require_internal(x_api_key)

    scored = [_classify_activity(a.description, a.competency_tags) for a in body.activities]
    overall = round(sum(a.relevance for a in scored) / len(scored), 3) if scored else 0.0
    summary = _summarize(body, scored)
    quality = _score_quality(body)
    plagiarism = check_entry(_entry_text(body.activities, body.reflection), body.corpus)
    feedback = await draft_feedback(
        activities=[a.description for a in body.activities],
        learning=body.reflection.learning if body.reflection else "",
        challenges=body.reflection.challenges if body.reflection else "",
        rubric_feedback=quality.feedback,
        concerns=summary.concerns,
    )

    return EnrichEntryResponse(
        model_name=MODEL_NAME,
        relevance=overall,
        summary=summary,
        quality=quality,
        plagiarism=plagiarism,
        feedback_draft=feedback,
    )


# ── Cross-week (placement) summary — runs ONCE at finalization ───────────────
class PlacementEntryIn(BaseModel):
    week_number: int
    activities: list[ActivityIn] = Field(default_factory=list)


class PlacementSummaryRequest(BaseModel):
    placement_id: str
    entries: list[PlacementEntryIn] = Field(default_factory=list)


class PlacementSummary(BaseModel):
    headline: str
    themes: list[str] = Field(default_factory=list)
    week_count: int = Field(ge=0)
    recommendations: list[str] = Field(default_factory=list)


class PlacementSummaryResponse(BaseModel):
    model_name: str
    summary: PlacementSummary


@router.post("/enrich/placement", response_model=PlacementSummaryResponse)
async def enrich_placement(
    body: PlacementSummaryRequest,
    x_api_key: str | None = Header(default=None),
) -> PlacementSummaryResponse:
    """Advisory cross-week summary over the acknowledged corpus. Fail-open on the
    Node side: if this is unavailable, finalization proceeds without a summary."""
    _require_internal(x_api_key)

    theme_counts: dict[str, int] = {}
    total_activities = 0
    for entry in body.entries:
        for act in entry.activities:
            total_activities += 1
            scored = _classify_activity(act.description, act.competency_tags)
            for theme in scored.themes:
                theme_counts[theme] = theme_counts.get(theme, 0) + 1

    weeks = len(body.entries)
    themes = sorted(theme_counts, key=lambda t: theme_counts[t], reverse=True)

    recommendations: list[str] = []
    if weeks == 0:
        headline = "No acknowledged weeks to summarize."
    else:
        top = ", ".join(themes[:3]) if themes else "general software work"
        headline = (
            f"{weeks} acknowledged week{'s' if weeks != 1 else ''}, "
            f"{total_activities} activities; strongest areas: {top}."
        )
        if len(themes) <= 1:
            recommendations.append("Exposure looks narrow — consider broadening competency areas.")
        if "testing_quality" not in theme_counts:
            recommendations.append("Little evidence of testing/QA work across the placement.")

    return PlacementSummaryResponse(
        model_name=MODEL_NAME,
        summary=PlacementSummary(
            headline=headline,
            themes=themes,
            week_count=weeks,
            recommendations=recommendations,
        ),
    )

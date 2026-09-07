"""
Competency classification by a model, not by a word list.

The keyword classifier it replaces could only recognise a competency if the
student happened to use one of ~70 hardcoded words. "Wrote a recursive-descent
parser for the config format" contains none of them and scored as off-topic;
"had a meeting about the code review" contains three and scored as solidly
technical. It was measuring vocabulary overlap and reporting it as relevance.

What this does instead: reads the activity, decides which competencies it
actually demonstrates, and says how confident it is — with a short reason a
supervisor can disagree with.

Three rules hold it honest:

* **A closed taxonomy.** The model may only return tags from `TAXONOMY`.
  Anything else is dropped rather than persisted, so tags stay aggregatable
  across a cohort and cannot drift into free text.
* **Fail-open to the word list.** No key, no network, a malformed reply — the
  keyword classifier still runs and enrichment still returns. A degraded score
  beats a failed pipeline.
* **Advisory, and never a grade.** The prompt forbids grading language, and the
  caller treats these as suggestions a human confirms.
"""
from __future__ import annotations

import json

import httpx
from pydantic import BaseModel, Field

from config.settings import settings

CLASSIFY_TIMEOUT_S = 25.0
MAX_ACTIVITIES = 20
MAX_TEXT_CHARS = 1_200

# The controlled vocabulary. Keys are what gets stored; the descriptions are for
# the model, and are what make "recursive-descent parser" land in
# software_engineering without the word "parser" appearing anywhere.
TAXONOMY: dict[str, str] = {
    "software_engineering":
        "designing, writing, refactoring or reviewing program code of any kind, "
        "in any language — including algorithms, data structures and parsers",
    "data":
        "databases, queries, schemas, migrations, data modelling, pipelines, "
        "analysis or reporting on data",
    "testing_quality":
        "writing or running tests, debugging, code review for correctness, QA, "
        "validation, tracking down a defect",
    "devops_infra":
        "servers, deployment, containers, cloud services, networking, "
        "monitoring, logging, build or CI configuration",
    "security":
        "authentication, authorisation, encryption, access control, handling "
        "credentials or personal data safely, security review",
    "ux_design":
        "user interface or user experience work — layout, usability, "
        "accessibility, visual design, prototyping",
    "documentation":
        "writing documentation, specifications, reports, user guides or "
        "technical notes for others to read",
    "collaboration":
        "meetings, standups, pairing, mentoring, requirements gathering, "
        "presenting, coordinating with colleagues or stakeholders",
    "professional_practice":
        "workplace conduct not specific to CS — scheduling, onboarding, "
        "administrative tasks, shadowing, observing",
}

SYSTEM_PROMPT = f"""You classify what a computer-science intern in Ghana did at \
work, from their own logbook entry.

For each activity, decide which of these competencies it genuinely demonstrates:

{chr(10).join(f'- {k}: {v}' for k, v in TAXONOMY.items())}

Rules:
- Use ONLY the competency keys listed above. Never invent a new one.
- Judge what the activity IS, not which words it contains. "Built a recursive \
descent parser" is software_engineering even though it names no framework.
- An activity may demonstrate more than one competency, or none.
- `relevance` is 0.0-1.0: how clearly this is professional computer-science \
work. Routine workplace admin is low; substantial technical work is high. It is \
NOT a measure of quality, effort or correctness.
- `reason` is one short clause a supervisor can disagree with. No praise, no \
criticism, no grading language, no scores out of anything.
- Do not invent detail the entry does not contain.

Reply with JSON only, no prose:
{{"activities": [{{"index": 0, "competencies": ["..."], "relevance": 0.0, \
"reason": "..."}}]}}"""


class ClassifiedActivity(BaseModel):
    index: int
    competencies: list[str] = Field(default_factory=list)
    relevance: float = Field(ge=0.0, le=1.0)
    reason: str = ""


def _coerce(raw: dict, count: int) -> list[ClassifiedActivity] | None:
    """Validate the model's reply. Anything off-taxonomy or out of range is
    dropped rather than trusted — the hard rule is that no AI-originated value
    reaches the database unvalidated."""
    items = raw.get("activities")
    if not isinstance(items, list):
        return None

    out: list[ClassifiedActivity] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            idx = int(item.get("index", -1))
        except (TypeError, ValueError):
            continue
        if not 0 <= idx < count:
            continue

        tags = [t for t in item.get("competencies", []) if t in TAXONOMY]
        try:
            rel = float(item.get("relevance", 0.0))
        except (TypeError, ValueError):
            rel = 0.0
        rel = max(0.0, min(1.0, rel))
        if rel != rel:  # NaN
            rel = 0.0

        reason = str(item.get("reason", ""))[:200]
        out.append(ClassifiedActivity(index=idx, competencies=tags, relevance=rel, reason=reason))

    return out or None


async def classify(activities: list[str]) -> list[ClassifiedActivity] | None:
    """Classify a week's activities. `None` on any failure — the caller falls
    back to the keyword classifier rather than losing the enrichment pass."""
    texts = [a.strip()[:MAX_TEXT_CHARS] for a in activities if a.strip()][:MAX_ACTIVITIES]
    if not texts or not settings.GROQ_API_KEY:
        return None

    listing = "\n".join(f"{i}. {t}" for i, t in enumerate(texts))

    try:
        async with httpx.AsyncClient(timeout=CLASSIFY_TIMEOUT_S) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    # Classification wants the same answer every time, so the
                    # supervisor sees a stable signal rather than one that
                    # wobbles between reloads.
                    "temperature": 0.0,
                    "max_tokens": 1_200,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Activities:\n{listing}"},
                    ],
                },
            )
        if resp.status_code != 200:
            return None
        content = (resp.json()["choices"][0]["message"]["content"] or "").strip()
        return _coerce(json.loads(content), len(texts))
    except Exception:
        return None

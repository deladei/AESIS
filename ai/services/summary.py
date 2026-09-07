"""
Weekly and placement summaries written by a model, not assembled from counts.

What this replaces said nothing a supervisor could not already see:

    "5 activities logged; 4 clearly CS-relevant."
    "6 acknowledged weeks, 31 activities; strongest areas: data, testing_quality."

Both are counting templates wearing the word "summary". They restate the table
directly above them and cost the reader a line to learn nothing. A supervisor
opening a week wants to know *what the student actually did* — and, across a
placement, what the arc of the work was.

The division of labour is the important part, and it is deliberate:

* **The code counts. The model narrates.** Every number, every competency theme
  and every fact-derived concern is still computed deterministically and passed
  in. The model is given no arithmetic to do and no taxonomy to choose from, so
  it cannot produce a summary whose figures disagree with the table beside it —
  the failure mode that makes an AI summary worse than none at all.
* **Fail-open to the template.** No key, no network, a malformed or evaluative
  reply — the count-based headline still renders. The caller reports which path
  ran, so a degraded summary is never passed off as the model's work.
* **Advisory, never a grade.** The prompt forbids grading language and
  `_is_evaluative` enforces it on the way out, because "must never imply a
  grade" is a hard rule of this system and a prompt alone is not enforcement.
"""
from __future__ import annotations

import json
import re

import httpx
from pydantic import BaseModel, Field

from config.settings import settings

SUMMARY_TIMEOUT_S = 25.0
MAX_ACTIVITIES = 30
MAX_ACTIVITY_CHARS = 600
MAX_REFLECTION_CHARS = 1_500
MAX_HEADLINE_CHARS = 320
MAX_ITEM_CHARS = 200
MAX_ITEMS = 3

# Assessment vocabulary. Narrow on purpose: only terms that are unambiguously a
# mark or a verdict. Ordinary evaluative adjectives are left alone — banning
# them would strip the prose of anything worth reading and push every summary
# back to the template, which is the outcome this exists to avoid.
# The numeric alternatives are anchored separately: a trailing \b can never
# match after "%", so folding them into the word-boundary group silently let
# every percentage through.
_EVALUATIVE = re.compile(
    r"\b(?:grade[sd]?|grading|marks|distinction|merit|pass/fail|out of \d+)\b"
    r"|\d+\s*(?:%|percent\b|/\s*\d+)",
    re.IGNORECASE,
)
# Deliberately NOT banned: "passing" and "failing". "Traced the failing
# integration tests" is ordinary CS prose, and blocking it would send most real
# summaries back to the template — trading the whole feature for a word.


class WeekNarrative(BaseModel):
    headline: str
    concerns: list[str] = Field(default_factory=list)


class PlacementNarrative(BaseModel):
    headline: str
    recommendations: list[str] = Field(default_factory=list)


WEEK_PROMPT = """You write one short summary of a computer-science intern's \
week in Ghana, for the academic supervisor who is about to review it.

Write about the WORK. Name what was actually built, fixed, investigated or \
attended. A supervisor can already see how many activities there are; what they \
cannot see at a glance is what the week amounted to.

Rules:
- `headline`: one or two sentences, plain past tense, describing the substance \
of the week. Concrete over general: "Built the invoice export and traced a \
duplicate-payment bug" beats "worked on backend tasks".
- Never state counts, totals, percentages or scores. Those are computed \
elsewhere and shown beside your text; inventing your own would contradict them.
- No praise, no criticism, no grading language, no marks, no pass/fail. This is \
a description, not an assessment.
- Do not invent anything the entry does not say. If the entry is too thin to \
describe, say exactly that.
- `concerns`: at most 3 things the supervisor should look into, each one short \
clause, each grounded in what is written. An empty list is correct when there \
is nothing to raise. Do not pad it.

Reply with JSON only, no prose:
{"headline": "...", "concerns": ["..."]}"""

PLACEMENT_PROMPT = """You write one short summary of a computer-science \
intern's whole placement in Ghana, for the supervisor signing it off.

Describe the ARC of the work — what the intern spent the placement doing, and \
how it developed from the early weeks to the later ones.

Rules:
- `headline`: two or three sentences on the substance of the placement.
- Never state counts, totals, week numbers, percentages or scores. Those are \
computed elsewhere and shown beside your text.
- No praise, no criticism, no grading language, no marks, no pass/fail.
- Do not invent anything the entries do not say.
- `recommendations`: at most 3 forward-looking suggestions grounded in what the \
entries show — a gap in exposure, an area worth deepening. Each a short clause. \
An empty list is correct when the entries do not support one.

Reply with JSON only, no prose:
{"headline": "...", "recommendations": ["..."]}"""


def _is_evaluative(text: str) -> bool:
    return bool(_EVALUATIVE.search(text))


def _clean(text: object, limit: int) -> str:
    """Collapse a model string to one tidy line within a hard length bound."""
    if not isinstance(text, str):
        return ""
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _clean_items(raw: object) -> list[str]:
    """Validate a list of short clauses, dropping anything evaluative.

    A single bad item loses that item, not the whole summary — the headline is
    the part worth falling back over.
    """
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        text = _clean(item, MAX_ITEM_CHARS)
        if text and not _is_evaluative(text) and text not in out:
            out.append(text)
    return out[:MAX_ITEMS]


async def _ask(system_prompt: str, user_content: str) -> dict | None:
    """One JSON completion. `None` on any failure — the caller falls back."""
    if not settings.GROQ_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=SUMMARY_TIMEOUT_S) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    # Low but not zero: a summary should read as prose rather
                    # than as a template, and should not change character
                    # between two reloads of the same week.
                    "temperature": 0.3,
                    "max_tokens": 700,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content},
                    ],
                },
            )
        if resp.status_code != 200:
            return None
        content = (resp.json()["choices"][0]["message"]["content"] or "").strip()
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _activity_listing(descriptions: list[str]) -> str:
    trimmed = [d.strip()[:MAX_ACTIVITY_CHARS] for d in descriptions if d.strip()]
    return "\n".join(f"- {d}" for d in trimmed[:MAX_ACTIVITIES])


async def summarize_week(
    activities: list[str],
    learning: str = "",
    challenges: str = "",
) -> WeekNarrative | None:
    """Narrate one week. `None` whenever the template should be used instead."""
    listing = _activity_listing(activities)
    if not listing:
        return None

    parts = [f"Activities this week:\n{listing}"]
    if learning.strip():
        parts.append(f"\nWhat the student says they learned:\n{learning.strip()[:MAX_REFLECTION_CHARS]}")
    if challenges.strip():
        parts.append(f"\nChallenges the student describes:\n{challenges.strip()[:MAX_REFLECTION_CHARS]}")

    raw = await _ask(WEEK_PROMPT, "\n".join(parts))
    if raw is None:
        return None

    headline = _clean(raw.get("headline"), MAX_HEADLINE_CHARS)
    if not headline or _is_evaluative(headline):
        # An evaluative headline is not something to sanitise and ship — the
        # model has answered a different question than the one asked, so the
        # count-based template is the honest thing to show.
        return None

    return WeekNarrative(headline=headline, concerns=_clean_items(raw.get("concerns")))


async def summarize_placement(weeks: list[tuple[int, list[str]]]) -> PlacementNarrative | None:
    """Narrate a whole placement from its acknowledged weeks, oldest first."""
    blocks: list[str] = []
    for week_number, descriptions in weeks:
        listing = _activity_listing(descriptions)
        if listing:
            blocks.append(f"Week {week_number}:\n{listing}")
    if not blocks:
        return None

    raw = await _ask(PLACEMENT_PROMPT, "\n\n".join(blocks))
    if raw is None:
        return None

    headline = _clean(raw.get("headline"), MAX_HEADLINE_CHARS)
    if not headline or _is_evaluative(headline):
        return None

    return PlacementNarrative(
        headline=headline,
        recommendations=_clean_items(raw.get("recommendations")),
    )

"""
Semantic quality assessment — reading the entry, not measuring it.

The rubric scorer this replaces (`quality_scorer.py`) does not assess quality.
It measures length and vocabulary and calls the result quality:

* **Task depth** is 40 points for reaching 200 words, 20 for having 5 sentences,
  20 for an average sentence of 15+ words, and 20 for containing five numbers.
  Padding a thin week with filler and a few version strings maxes it; a precise
  sixty-word account of real engineering work cannot pass about 35.
* **Reflection** is 50 points for reaching 150 words and 50 for matching regexes
  like `\\bi (learned|discovered)\\b`. It rewards the phrase "I learned", not
  learning.
* **Temporal consistency** is 100 points for using four of {monday, then, after,
  finally, morning, began, ...}. It is a writing-tic detector wearing the name
  of a coherence measure.
* **Tech vocab** is keyword density over a fixed word list — the same failure
  the competency classifier had, where "wrote a recursive-descent parser" reads
  as non-technical because it names no framework.

Every dimension is a proxy that a student can satisfy without doing the work,
and that a student who did the work can fail. This reads the entry instead.

The same three rules as the rest of the AI path hold it honest:

* **The model judges; the code bounds and composes.** Each dimension is clamped
  into [0, 100] before it goes anywhere, and `overall` is computed from the four
  by the existing rubric weights rather than asked for — so the composite can
  never disagree with its own parts.
* **Fail-open to the rubric.** No key, no network, a malformed reply — the
  heuristic scorer still runs. The caller reports which path produced the
  numbers, so a supervisor is never shown the floor as if it were a judgement.
* **Advisory, never a grade.** Scores inform a supervisor's read of an entry.
  The prompt forbids grading language and forbids a verdict on the student.
"""
from __future__ import annotations

import json
import re

import httpx
from pydantic import BaseModel, Field

from config.settings import settings
from services.quality_scorer import clamp_quality_score

ASSESS_TIMEOUT_S = 25.0
MAX_ACTIVITIES = 30
MAX_ACTIVITY_CHARS = 600
MAX_REFLECTION_CHARS = 1_500
MAX_EVIDENCE_CHARS = 200
MAX_FEEDBACK_CHARS = 600

DIMENSIONS = ("task_depth", "tech_vocab", "reflection", "temporal_consistency")

# Flags are persisted and filtered on, so they stay a closed vocabulary rather
# than free text the model invents a new spelling of each week.
FLAGS: dict[str, str] = {
    "low_cs_relevance": "the work described is not recognisably computer science",
    "thin_detail": "too little detail to tell what was actually done",
    "no_reflection": "no reflection on the work, or reflection that only restates it",
    "repetitive": "the week repeats itself, or repeats an earlier week almost verbatim",
    "unverifiable": "claims work that the entry gives no concrete account of",
}

SYSTEM_PROMPT = f"""You assess the QUALITY of a computer-science intern's weekly \
logbook entry, for the academic supervisor who reviews it. Ghana, university CS \
placement.

Score four dimensions from 0 to 100:

- `task_depth`: how concretely the work is described. Can a supervisor tell what \
was actually built, fixed or investigated? Specific beats general.
- `tech_vocab`: technical substance. Does the entry show real engineering \
content? Judge the WORK, not the words: "wrote a recursive-descent parser for \
the config format" is highly technical though it names no framework, while a \
list of technology names with no work attached is not.
- `reflection`: genuine analysis. Does the student examine what happened — why \
something failed, what they would do differently, what they now understand? \
Restating the tasks in the past tense is not reflection.
- `temporal_consistency`: does the week read as coherent, plausible progression \
of work? Not whether it uses words like "Monday" or "then".

Rules:
- Do NOT reward length. A precise sixty-word account of real work scores higher \
than three hundred words of padding. Do not reward keyword lists, and do not \
penalise an entry for naming no technologies if the work itself is technical.
- `evidence` is one short clause per dimension quoting or pointing at what in \
the entry drove the score. A supervisor must be able to disagree with it.
- `flags` may ONLY be drawn from: {", ".join(FLAGS)}. Use only what applies; an \
empty list is correct for a solid entry.
- `feedback` is at most three sentences addressed to the supervisor about this \
entry — what to look at, what to ask the student. No praise, no criticism of \
the student as a person, no grading language, no marks, no pass/fail. If the \
entry is solid, say what makes it usable and stop.
- Do not invent detail the entry does not contain.

Reply with JSON only, no prose:
{{"task_depth": 0, "tech_vocab": 0, "reflection": 0, "temporal_consistency": 0, \
"evidence": {{"task_depth": "...", "tech_vocab": "...", "reflection": "...", \
"temporal_consistency": "..."}}, "flags": ["..."], "feedback": "..."}}"""


class ModelQuality(BaseModel):
    task_depth: float = Field(ge=0.0, le=100.0)
    tech_vocab: float = Field(ge=0.0, le=100.0)
    reflection: float = Field(ge=0.0, le=100.0)
    temporal_consistency: float = Field(ge=0.0, le=100.0)
    evidence: dict[str, str] = Field(default_factory=dict)
    flags: list[str] = Field(default_factory=list)
    feedback: str = ""


def _clean(text: object, limit: int) -> str:
    if not isinstance(text, str):
        return ""
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _coerce(raw: dict) -> ModelQuality | None:
    """Validate the model's assessment. A dimension that cannot be read as a
    number in range invalidates the whole assessment rather than defaulting to
    zero — a fabricated 0 would show a supervisor a failing dimension the model
    never actually judged."""
    if not isinstance(raw, dict):
        return None

    scores: dict[str, float] = {}
    for dim in DIMENSIONS:
        value, _ = clamp_quality_score(raw.get(dim))
        if value is None:
            return None
        scores[dim] = value

    evidence_raw = raw.get("evidence")
    evidence = {}
    if isinstance(evidence_raw, dict):
        for dim in DIMENSIONS:
            clause = _clean(evidence_raw.get(dim), MAX_EVIDENCE_CHARS)
            if clause:
                evidence[dim] = clause

    # Off-vocabulary flags are dropped, not persisted: a model inventing
    # "needs_more_effort" would put an unfilterable judgement on the record.
    # Built with an explicit loop — inside a comprehension the "already seen"
    # test would read the list being assigned, which is empty throughout.
    flags: list[str] = []
    flags_raw = raw.get("flags")
    if isinstance(flags_raw, list):
        for flag in flags_raw:
            if flag in FLAGS and flag not in flags:
                flags.append(flag)

    return ModelQuality(
        **scores,
        evidence=evidence,
        flags=flags,
        feedback=_clean(raw.get("feedback"), MAX_FEEDBACK_CHARS),
    )


async def assess(
    activities: list[str],
    learning: str = "",
    challenges: str = "",
) -> ModelQuality | None:
    """Assess one week. `None` on any failure — the caller falls back to the
    rubric scorer rather than losing the enrichment pass."""
    texts = [a.strip()[:MAX_ACTIVITY_CHARS] for a in activities if a.strip()][:MAX_ACTIVITIES]
    if not texts or not settings.GROQ_API_KEY:
        return None

    parts = ["Activities this week:\n" + "\n".join(f"- {t}" for t in texts)]
    if learning.strip():
        parts.append(f"\nWhat the student says they learned:\n{learning.strip()[:MAX_REFLECTION_CHARS]}")
    if challenges.strip():
        parts.append(f"\nChallenges the student describes:\n{challenges.strip()[:MAX_REFLECTION_CHARS]}")
    else:
        parts.append("\n(The student recorded no challenges.)")

    try:
        async with httpx.AsyncClient(timeout=ASSESS_TIMEOUT_S) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    # An assessment must not move between two reloads of the
                    # same unchanged entry, or a supervisor cannot rely on it.
                    "temperature": 0.0,
                    "max_tokens": 900,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": "\n".join(parts)},
                    ],
                },
            )
        if resp.status_code != 200:
            return None
        content = (resp.json()["choices"][0]["message"]["content"] or "").strip()
        return _coerce(json.loads(content))
    except Exception:
        return None

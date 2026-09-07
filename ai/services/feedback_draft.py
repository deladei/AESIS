"""
Supervisor feedback draft via Groq (Path 2, human-in-loop).

Generates a short, formative feedback draft the supervisor can edit before
sending — it is NEVER shown to the student directly. The UI prefills an
editable comment box with it; the supervisor owns every word that goes out.

Fail-open: no GROQ_API_KEY, a network error, a non-2xx, or an empty/oversized
completion all return None, and the enrichment response simply carries no
draft. Human review never depends on this.

Hard rule: advisory only. The prompt forbids grades/marks/pass-fail language,
and the draft is length-capped; the human-in-the-loop is the real guardrail.
"""
from __future__ import annotations

import httpx
from pydantic import BaseModel

from config.settings import settings

DRAFT_TIMEOUT_S = 20.0
MAX_DRAFT_CHARS = 1_200
MAX_CONTEXT_CHARS = 4_000

# How many alternatives to offer. One draft made the feature a coin flip: take
# it or write your own. A supervisor reviewing a cohort wants to pick a tone,
# not accept a sentence.
DRAFT_COUNT = 10

SYSTEM_PROMPT = f"""You draft weekly logbook feedback for an academic supervisor \
overseeing a computer-science internship in Ghana.

Write {DRAFT_COUNT} DIFFERENT drafts. Each is 2-4 sentences of constructive, \
specific feedback addressed directly to the student ("you"), based only on what \
they logged. Acknowledge something concrete they did well, then give one or two \
actionable suggestions drawn from the rubric hints.

Vary them meaningfully — different opening, different emphasis, different \
register (warm, plain, brisk) — so the supervisor is choosing between real \
alternatives rather than rewordings.

Never mention grades, marks, scores, percentages, passing or failing. Never \
mention that AI or a rubric was involved. Do not invent activities that are not \
in the log.

Output EXACTLY {DRAFT_COUNT} drafts, one per line, each prefixed with "---". No \
headings, no numbering, no bullet points, no blank lines within a draft."""


class FeedbackDraft(BaseModel):
    """`text` is the first draft — kept so older clients and the stored JSONB
    shape keep working. `alternatives` carries the rest."""
    text: str
    alternatives: list[str] = []
    model: str


def _build_user_prompt(
    activities: list[str],
    learning: str,
    challenges: str,
    rubric_feedback: str,
    concerns: list[str],
) -> str:
    lines = ["This week's logged activities:"]
    lines += [f"- {a}" for a in activities] if activities else ["- (none logged)"]
    if learning:
        lines.append(f"\nStudent's reflection on learning: {learning}")
    if challenges:
        lines.append(f"Challenges the student reported: {challenges}")
    if rubric_feedback:
        lines.append(f"\nRubric hints (rephrase, do not quote): {rubric_feedback}")
    if concerns:
        lines.append("Reviewer attention points: " + " ".join(concerns))
    return "\n".join(lines)[:MAX_CONTEXT_CHARS]


async def draft_feedback(
    activities: list[str],
    learning: str,
    challenges: str,
    rubric_feedback: str,
    concerns: list[str],
) -> FeedbackDraft | None:
    """Return a draft, or None if Groq is unconfigured/unreachable/unusable."""
    if not settings.GROQ_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=DRAFT_TIMEOUT_S) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": _build_user_prompt(
                                activities, learning, challenges, rubric_feedback, concerns
                            ),
                        },
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2_000,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            drafts = _split_drafts(raw or "")
            if not drafts:
                return None
            return FeedbackDraft(
                text=drafts[0],
                alternatives=drafts[1:],
                model=settings.GROQ_MODEL,
            )
    except Exception:
        return None  # fail-open: enrichment proceeds without a draft


def _split_drafts(raw: str) -> list[str]:
    """Split the completion into individual drafts.

    The model is asked for `---`-prefixed lines, but a model that ignores the
    format must not cost the supervisor the whole feature — so a completion with
    no separators falls back to being one draft.
    """
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    marked = [ln.lstrip("- ").strip() for ln in lines if ln.startswith("---")]
    candidates = marked if marked else ([raw.strip()] if raw.strip() else [])

    out: list[str] = []
    for c in candidates:
        c = c[:MAX_DRAFT_CHARS]
        if c and c not in out:
            out.append(c)
    return out[:DRAFT_COUNT]

"""
Writing assistance for a STUDENT's own daily logbook entry.

This is deliberately not a generator. The student's log is evidence — it is read
by a supervisor, it feeds an advisory quality score, and it is the basis of the
end-of-placement recap. A model that writes the entry for them would be
fabricating the record, so this service only ever works on words the student has
already written:

  * With notes  → tidy and expand THEIR notes into full sentences, adding
                  nothing that is not already implied by what they wrote.
  * Empty       → return prompting QUESTIONS, never prose. There is nothing to
                  expand, and inventing a day's work is exactly the failure mode
                  this exists to avoid.

Fail-open, like `feedback_draft`: no key, a network error, a non-2xx or an empty
completion all return None and the caller simply offers no suggestion.
"""
from __future__ import annotations

import httpx
from pydantic import BaseModel

from config.settings import settings

ASSIST_TIMEOUT_S = 20.0
MAX_ASSIST_CHARS = 1_500
MAX_NOTES_CHARS = 4_000

SYSTEM_PROMPT = """You help a computer-science intern in Ghana write up a day of \
their industrial-attachment logbook.

You rewrite ONLY what the student has already told you. Expand their rough notes \
into clear, specific prose in the first person and past tense, as a professional \
daily log entry.

Absolute rules:
- Never invent a task, tool, meeting, outcome or metric the notes do not mention.
- Never add achievements, praise or self-assessment.
- Never mention grades, marks, scores, percentages, passing or failing.
- Never mention AI, prompts or that anything was generated.
- Keep it under 200 words. Plain text only, no headings, no bullet points.

If the notes are too thin to expand honestly, do not invent filler: reply with \
two or three short questions that would draw out the missing detail, each on its \
own line, starting with "?"."""

PROMPT_ONLY_FALLBACK = [
    "What was the main task you worked on today?",
    "What tool, language or system did you use for it?",
    "What was hard about it, and what did you try?",
    "What did you finish, and what is still open?",
]


class EntryAssist(BaseModel):
    """`text` is prose to insert; `questions` is what to ask when there is
    nothing to expand. Exactly one of them is ever populated."""
    text: str | None = None
    questions: list[str] = []
    model: str


def _build_user_prompt(notes: str, skills: str, week_number: int | None) -> str:
    lines: list[str] = []
    if week_number:
        lines.append(f"Week {week_number} of the attachment.")
    lines.append("The student's rough notes for today:")
    lines.append(notes.strip()[:MAX_NOTES_CHARS] or "(nothing written yet)")
    if skills.strip():
        lines.append("")
        lines.append("Skills they said they picked up:")
        lines.append(skills.strip()[:MAX_NOTES_CHARS])
    return "\n".join(lines)


async def draft_entry(
    notes: str,
    skills: str = "",
    week_number: int | None = None,
) -> EntryAssist | None:
    """Expand the student's notes, or ask for more. None on any failure."""
    # Nothing to work from: answer locally rather than spending a model call on
    # a question whose answer cannot depend on the input.
    if not notes.strip():
        return EntryAssist(questions=PROMPT_ONLY_FALLBACK, model="local/prompts")

    if not settings.GROQ_API_KEY:
        return None

    try:
        async with httpx.AsyncClient(timeout=ASSIST_TIMEOUT_S) as client:
            resp = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "temperature": 0.3,
                    "max_tokens": 400,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": _build_user_prompt(notes, skills, week_number)},
                    ],
                },
            )
        if resp.status_code != 200:
            return None
        content = (resp.json()["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return None

    if not content:
        return None

    # The model answers with questions when the notes are too thin to expand.
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    if lines and all(ln.startswith("?") for ln in lines):
        return EntryAssist(
            questions=[ln.lstrip("? ").strip() for ln in lines][:4],
            model=settings.GROQ_MODEL,
        )

    return EntryAssist(text=content[:MAX_ASSIST_CHARS], model=settings.GROQ_MODEL)

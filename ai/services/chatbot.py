"""
RAG chatbot — AESIS Assistant.

Retrieval comes from the `knowledge_passage` corpus in Postgres (see
`services/knowledge.py`); generation is Groq over an OpenAI-compatible API.

It used to retrieve from a FAISS index in `/tmp`, seeded with a dozen hardcoded
strings — which was worse than having no corpus at all, because several of them
were WRONG: they described a Friday 23:59 deadline this system does not enforce
and an "approved" status the state machine does not have. A grounded assistant
citing stale rules is more dangerous than one that says it does not know.

Now: the corpus is the department's own document, the passages carry the heading
they came from so an answer can cite it, and retrieving nothing means the model
is told to say so rather than to improvise.
"""
import json
from datetime import datetime, timezone
from typing import AsyncIterator
import httpx
from sentence_transformers import SentenceTransformer

from config.settings import settings

_UNAVAILABLE = (
    "I'm currently unable to reach the language model service. "
    "Please try again in a moment. If the problem persists, "
    "your supervisor and coordinator are available to help."
)

from services.chat_prompt import SYSTEM_PROMPT, _system_prompt  # noqa: F401



class ChatbotService:
    """Holds the one embedding model.

    There is no index to load any more: the corpus lives in Postgres and
    `services.knowledge` does the retrieval, so this class owns exactly one
    thing — the SentenceTransformer, which is expensive and shared.
    """

    def __init__(self):
        self.embedder: SentenceTransformer | None = None
        self._load_model()

    def _load_model(self):
        try:
            self.embedder = SentenceTransformer(settings.EMBEDDING_MODEL)
        except Exception as e:
            print(f"[chatbot] Failed to load embedding model: {e}")

    # Why the last chat turn failed. The fallback the student sees is
    # deliberately vague, and this service's logs are not readable from
    # anywhere the person debugging it usually is, so the status code was
    # simply lost — "unable to reach the language model service" covers a
    # rate limit, a rejected payload and a dead network equally well.
    last_failure: dict[str, str] | None = None

    async def chat(
        self,
        session_id: str,
        user_message: str,
        history: list[dict],
        record: str = "",
    ) -> AsyncIterator[str]:
        """
        Stream a response token-by-token from Groq's OpenAI-compatible chat completions
        endpoint. Falls back to a static message if no API key is set or the request fails.
        """
        # Retrieval is the whole point: what comes back here is what the model
        # is allowed to say. Nothing back means "not in the regulations".
        from services import knowledge  # imported here to avoid a circular import
        passages = await knowledge.retrieve(user_message)

        messages = [{"role": "system", "content": _system_prompt(bool(record.strip()))}]
        if record.strip():
            messages.append({
                "role": "system",
                "content": f"This student's own record:\n\n{record.strip()}",
            })
        if passages:
            context = "\n\n".join(f"### {p.section}\n{p.content}" for p in passages)
            messages.append({
                "role": "system",
                "content": f"Regulation extracts:\n\n{context}",
            })
        else:
            # The old wording here ordered a refusal outright, so "hello"
            # retrieved nothing and was answered with "I don't have that in the
            # regulations" — the assistant refusing to say hello. Refusing is
            # for rules it does not have; the message type decides.
            messages.append({
                "role": "system",
                "content": (
                    "No regulation extract matched this message. If it is a greeting, "
                    "small talk, or a question about what you can help with, answer it "
                    "normally and warmly — do NOT refuse and do NOT mention regulations. "
                    "If it asks about a rule, a deadline or a procedure, say you do not "
                    "have that in the regulations and point the student at their academic "
                    "supervisor or the programme coordinator. Never invent a rule."
                ),
            })

        # What the corpus actually covers, so "what can you help me with?" is
        # answered from the real document rather than a blurb that goes stale
        # the moment someone edits it.
        topics = await knowledge.sections()
        if topics:
            messages.append({
                "role": "system",
                "content": (
                    "Topics the department's regulations cover, for describing what you "
                    "can help with:\n" + "\n".join(f"- {t}" for t in topics)
                ),
            })
        # Include last 6 turns of history for context
        for turn in history[-6:]:
            messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_message})

        if not settings.GROQ_API_KEY:
            yield (
                "The chatbot is not configured yet — no GROQ_API_KEY is set. "
                "Ask an administrator to add a free key from https://console.groq.com. "
                "In the meantime, your supervisor and coordinator are available to help."
            )
            return

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                        "Content-Type":  "application/json",
                    },
                    json={
                        "model":    settings.GROQ_MODEL,
                        "messages": messages,
                        "stream":   True,
                    },
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        payload = line[len("data:"):].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            chunk = json.loads(payload)
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            token = choices[0].get("delta", {}).get("content", "")
                            if token:
                                yield token
                            if choices[0].get("finish_reason"):
                                break
                        except json.JSONDecodeError:
                            continue

        except httpx.HTTPStatusError as e:
            # Groq puts the actual reason in the body — a rate limit, a model
            # that no longer exists, a rejected message shape. Read it: on a
            # streaming response it has not been fetched yet.
            try:
                detail = (await e.response.aread()).decode("utf-8", "replace")[:300]
            except Exception:
                detail = ""
            ChatbotService.last_failure = {
                "at": datetime.now(timezone.utc).isoformat(),
                "status": str(e.response.status_code),
                "detail": detail,
            }
            print(f"[chat] groq {e.response.status_code}: {detail}")
            yield _UNAVAILABLE
        except Exception as e:  # noqa: BLE001
            # Broadened deliberately: anything raising here escaped mid-stream,
            # which reaches the student as a truncated reply rather than as an
            # error, and left no trace at all.
            ChatbotService.last_failure = {
                "at": datetime.now(timezone.utc).isoformat(),
                "status": type(e).__name__,
                "detail": str(e)[:300],
            }
            print(f"[chat] {type(e).__name__}: {e}")
            yield _UNAVAILABLE


chatbot = ChatbotService()

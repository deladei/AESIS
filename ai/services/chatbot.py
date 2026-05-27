"""
RAG chatbot — AESIS Assistant.
Embeddings via sentence-transformers + retrieval via FAISS + generation via Groq
(OpenAI-compatible HTTP API). Falls back to a static response if Groq is unreachable
or no API key is configured.
"""
import os
import json
import pickle
import threading
from typing import AsyncIterator
import numpy as np
import faiss
import httpx
from sentence_transformers import SentenceTransformer

from config.settings import settings

KNOWLEDGE_INDEX_PATH = "/tmp/aesis_kb.index"
KNOWLEDGE_META_PATH  = "/tmp/aesis_kb_meta.pkl"
LOCK = threading.Lock()

SYSTEM_PROMPT = """You are AESIS Assistant, an academic internship support chatbot for a Computer Science department. You help students with:
- Understanding logbook requirements and submission guidelines
- Reflective writing techniques for CS internship logbooks
- General questions about their placement and academic expectations

Be concise, supportive, and academic in tone. If asked about specific marks or grades, explain you don't have access to that information. Never fabricate technical facts."""


class ChatbotService:
    def __init__(self):
        self.embedder: SentenceTransformer | None = None
        self.index:    faiss.IndexFlatIP | None   = None
        self.passages: list[str]                  = []
        self._load_model()
        self._load_index()

    def _load_model(self):
        try:
            self.embedder = SentenceTransformer(settings.EMBEDDING_MODEL)
        except Exception as e:
            print(f"[chatbot] Failed to load embedding model: {e}")

    def _load_index(self):
        if os.path.exists(KNOWLEDGE_INDEX_PATH) and os.path.exists(KNOWLEDGE_META_PATH):
            try:
                self.index = faiss.read_index(KNOWLEDGE_INDEX_PATH)
                with open(KNOWLEDGE_META_PATH, "rb") as f:
                    self.passages = pickle.load(f)
            except Exception:
                pass

        # Seed with built-in knowledge base if index is empty
        if not self.passages:
            self._seed_knowledge_base()

    def _seed_knowledge_base(self):
        built_in = [
            "Logbook entries must be submitted every week by Friday 23:59. Late submissions are flagged.",
            "A good logbook entry describes specific tasks completed, technologies used, challenges encountered, and personal reflection on learning.",
            "The reflection section should explain what you learned, how you overcame challenges, and what you would do differently.",
            "Technical vocabulary improves your logbook quality score. Name specific tools, languages, frameworks, and methods you used.",
            "Task descriptions should be specific: instead of 'fixed bugs', write 'resolved a null pointer exception in the authentication middleware by adding input validation'.",
            "Temporal language helps: use phrases like 'On Monday I...', 'By midweek...', 'After reviewing the requirements...'",
            "If you are struggling with your placement, contact your academic supervisor immediately — don't wait until your next submission.",
            "Plagiarism detection runs on all submissions. Write in your own words and describe your personal experience.",
            "Your academic supervisor reviews your logbook and provides weekly feedback. Aim for 'approved' status each week.",
            "The quality score is based on four dimensions: task depth (30%), technical vocabulary (25%), reflection (25%), and temporal consistency (20%).",
            "You can upload supporting documents (PDFs, screenshots) as attachments to any logbook submission.",
            "If a submission is flagged, review the AI feedback and your supervisor's comments, then discuss with your supervisor.",
        ]
        self.add_passages(built_in)

    def add_passages(self, texts: list[str]):
        """Add new knowledge passages to the retrieval index."""
        if not self.embedder or not texts:
            return
        with LOCK:
            embeddings = self.embedder.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            embeddings = embeddings.astype("float32")
            if self.index is None:
                self.index = faiss.IndexFlatIP(embeddings.shape[1])
            self.index.add(embeddings)
            self.passages.extend(texts)
            faiss.write_index(self.index, KNOWLEDGE_INDEX_PATH)
            with open(KNOWLEDGE_META_PATH, "wb") as f:
                pickle.dump(self.passages, f)

    def _retrieve(self, query: str, k: int = 5) -> list[str]:
        """Return top-k relevant passages for the query."""
        if not self.embedder or self.index is None or self.index.ntotal == 0:
            return []
        q_vec = self.embedder.encode([query], normalize_embeddings=True, show_progress_bar=False).astype("float32")
        k     = min(k, self.index.ntotal)
        distances, indices = self.index.search(q_vec, k)
        return [self.passages[i] for i in indices[0] if i >= 0 and distances[0][list(indices[0]).index(i)] > 0.2]

    async def chat(self, session_id: str, user_message: str, history: list[dict]) -> AsyncIterator[str]:
        """
        Stream a response token-by-token from Groq's OpenAI-compatible chat completions
        endpoint. Falls back to a static message if no API key is set or the request fails.
        """
        context_passages = self._retrieve(user_message, k=5)
        context = "\n".join(f"- {p}" for p in context_passages)

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        if context:
            messages.append({
                "role": "system",
                "content": f"Relevant knowledge:\n{context}",
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

        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError):
            yield (
                "I'm currently unable to reach the language model service. "
                "Please try again in a moment. If the problem persists, "
                "your supervisor and coordinator are available to help."
            )


chatbot = ChatbotService()

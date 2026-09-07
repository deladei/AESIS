from pydantic import BaseModel
from typing import Optional


class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    session_id: str
    student_id: str
    message: str
    placement_id: Optional[str] = None
    # Facts about the student asking, computed by the Node backend from the
    # system of record and scoped to the authenticated user. Empty for staff and
    # whenever the figures could not be built — the assistant then answers from
    # the regulations alone, exactly as before.
    context: str = ""


class QualityResult(BaseModel):
    quality_score: float
    task_depth_score: float
    tech_vocab_score: float
    reflection_score: float
    temporal_consistency_score: float
    relevance_score: float
    is_relevance_flagged: bool
    ai_feedback_summary: str

from pydantic import BaseModel
from typing import Optional


class AnalyzeLogbookRequest(BaseModel):
    submission_id: str
    student_id: str
    placement_id: str


class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    session_id: str
    student_id: str
    message: str
    placement_id: Optional[str] = None


class QualityResult(BaseModel):
    quality_score: float
    task_depth_score: float
    tech_vocab_score: float
    reflection_score: float
    temporal_consistency_score: float
    relevance_score: float
    is_relevance_flagged: bool
    ai_feedback_summary: str


class PlagiarismResult(BaseModel):
    plagiarism_similarity: float
    is_plagiarism_flagged: bool
    plagiarism_match_ids: list[str]


class SentimentResult(BaseModel):
    sentiment_polarity: float
    sentiment_class: str

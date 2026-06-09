"""
Rubric-based logbook quality scorer.
No model training required — runs purely on NLP heuristics.

Rubric weights:
  Task Depth       30%  — specificity, word count, sentence variety
  Tech Vocab       25%  — CS keyword density
  Reflection       25%  — first-person analytical language
  Temporal Consistency 20% — sequential/time markers
"""
import re
import math
from utils.text_processing import (
    clean_text, word_count, sentence_count, avg_sentence_length,
    count_cs_keywords, count_pattern_matches, CS_VOCABULARY,
    REFLECTION_MARKERS, TEMPORAL_MARKERS,
)
from models.schemas import QualityResult

CS_RELEVANCE_KEYWORDS = {
    "software", "code", "program", "system", "database", "server",
    "application", "network", "data", "algorithm", "interface", "debug",
    *CS_VOCABULARY,
}

QUALITY_MIN = 0.0
QUALITY_MAX = 100.0


def clamp_quality_score(raw):
    """
    Normalise a quality score to the valid [0, 100] range before it is persisted.

    Returns (clamped_value, was_out_of_range). `clamped_value` is None only when
    `raw` cannot be coerced to a number — callers must never write a non-numeric
    or out-of-range score to the database. The raw value should be logged by the
    caller whenever `was_out_of_range` is True.
    """
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None, True
    if n != n or n in (float("inf"), float("-inf")):  # NaN / inf
        return None, True
    clamped = max(QUALITY_MIN, min(QUALITY_MAX, n))
    return clamped, clamped != n


def _score_task_depth(tasks: str, challenges: str) -> float:
    """
    Rewards:
    - Word count (up to 200 words = full marks)
    - Sentence variety (>3 sentences good)
    - Specificity proxy: named proper nouns, numbers in text
    Returns 0–100.
    """
    combined = f"{tasks} {challenges}"
    wc = word_count(combined)
    sc = sentence_count(combined)
    asl = avg_sentence_length(combined)

    wc_score  = min(wc / 200, 1.0) * 40        # up to 40 pts for length
    sc_score  = min(sc / 5, 1.0) * 20           # up to 20 pts for # sentences
    asl_score = min(asl / 15, 1.0) * 20         # up to 20 pts for sentence complexity

    # Specificity: numbers (version refs, metrics, timings)
    specificity = len(re.findall(r"\b\d+(\.\d+)?\b", combined))
    spec_score  = min(specificity / 5, 1.0) * 20

    return min(wc_score + sc_score + asl_score + spec_score, 100.0)


def _score_tech_vocab(technologies: str, tasks: str) -> float:
    """
    Rewards CS keyword density across technologies + tasks text.
    Returns 0–100.
    """
    combined = f"{technologies} {tasks}"
    total_words = max(word_count(combined), 1)
    kw_count    = count_cs_keywords(combined)

    density = kw_count / math.sqrt(total_words)
    return min(density * 30, 100.0)


def _score_reflection(reflection: str) -> float:
    """
    Rewards first-person analytical language and lesson-learned framing.
    Returns 0–100.
    """
    if not reflection or word_count(reflection) < 10:
        return 0.0

    wc      = word_count(reflection)
    matches = count_pattern_matches(reflection, REFLECTION_MARKERS)

    wc_score    = min(wc / 150, 1.0) * 50
    marker_score = min(matches / 5, 1.0) * 50

    return min(wc_score + marker_score, 100.0)


def _score_temporal_consistency(tasks: str) -> float:
    """
    Rewards sequential/temporal language showing work-in-progress narrative.
    Returns 0–100.
    """
    matches = count_pattern_matches(tasks, TEMPORAL_MARKERS)
    return min(matches / 4, 1.0) * 100.0


def _compute_relevance(tasks: str, technologies: str) -> tuple[float, bool]:
    """
    Checks CS relevance of the entry.
    Returns (score 0–1, is_flagged).
    """
    combined    = f"{tasks} {technologies}"
    lower       = combined.lower()
    total_words = max(word_count(combined), 1)
    cs_hits     = sum(1 for kw in CS_RELEVANCE_KEYWORDS if kw in lower)
    score       = min(cs_hits / math.sqrt(total_words) * 2, 1.0)
    return round(score, 3), score < 0.15


def _generate_feedback(
    task_depth: float,
    tech_vocab: float,
    reflection: float,
    temporal: float,
    relevance_score: float,
) -> str:
    parts = []

    if task_depth < 40:
        parts.append("Provide more detail about the specific tasks completed — aim for at least 150 words with concrete examples.")
    elif task_depth > 75:
        parts.append("Good task description with strong specificity.")

    if tech_vocab < 30:
        parts.append("Include more technical terminology relevant to your work — name specific technologies, tools, and methods used.")
    elif tech_vocab > 70:
        parts.append("Strong use of CS-relevant technical vocabulary.")

    if reflection < 30:
        parts.append("Add a reflective paragraph discussing what you learned, challenges overcome, and how you would approach similar problems in the future.")
    elif reflection > 70:
        parts.append("Excellent reflection demonstrating analytical thinking.")

    if temporal < 30:
        parts.append("Use chronological language (e.g. 'On Monday...', 'After completing...', 'By the end of the week...') to show work progression.")

    if relevance_score < 0.15:
        parts.append("Ensure your entries focus on CS-related activities relevant to your placement role.")

    if not parts:
        return "Strong logbook entry. Continue maintaining this quality."

    return " ".join(parts)


def score(
    tasks: str,
    technologies: str,
    challenges: str = "",
    reflection: str = "",
) -> QualityResult:
    task_depth  = _score_task_depth(tasks, challenges)
    tech_vocab  = _score_tech_vocab(technologies, tasks)
    reflection_s = _score_reflection(reflection)
    temporal    = _score_temporal_consistency(tasks)

    quality = (
        task_depth   * 0.30 +
        tech_vocab   * 0.25 +
        reflection_s * 0.25 +
        temporal     * 0.20
    )

    relevance_score, is_relevance_flagged = _compute_relevance(tasks, technologies)

    feedback = _generate_feedback(task_depth, tech_vocab, reflection_s, temporal, relevance_score)

    return QualityResult(
        quality_score=round(quality, 2),
        task_depth_score=round(task_depth, 2),
        tech_vocab_score=round(tech_vocab, 2),
        reflection_score=round(reflection_s, 2),
        temporal_consistency_score=round(temporal, 2),
        relevance_score=relevance_score,
        is_relevance_flagged=is_relevance_flagged,
        ai_feedback_summary=feedback,
    )

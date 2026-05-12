"""
Sentiment analysis using VADER (fast, no GPU, no training).
Maps compound score to 6 emotion classes matching the PRD spec.
"""
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from models.schemas import SentimentResult

_analyser = SentimentIntensityAnalyzer()

# Emotion class mapping — ordered from most positive to most negative
_CLASSES = [
    ("encouraging",  0.50,  1.00),
    ("constructive", 0.10,  0.50),
    ("neutral",     -0.10,  0.10),
    ("supportive",   0.00,  0.10),   # overlaps — supervisor-specific tone
    ("critical",    -0.50, -0.10),
    ("frustrated",  -1.00, -0.50),
]


def _classify(compound: float) -> str:
    if compound >=  0.50:
        return "encouraging"
    if compound >=  0.10:
        return "constructive"
    if compound >= -0.10:
        return "neutral"
    if compound >= -0.50:
        return "critical"
    return "frustrated"


def analyse(text: str) -> SentimentResult:
    if not text or not text.strip():
        return SentimentResult(sentiment_polarity=0.0, sentiment_class="neutral")

    scores   = _analyser.polarity_scores(text)
    compound = round(scores["compound"], 3)

    return SentimentResult(
        sentiment_polarity=compound,
        sentiment_class=_classify(compound),
    )

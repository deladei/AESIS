import re
import string
import nltk
from typing import List

# Download once on import — safe to call multiple times
nltk.download("punkt", quiet=True)
nltk.download("punkt_tab", quiet=True)
nltk.download("stopwords", quiet=True)

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize

STOP_WORDS = set(stopwords.words("english"))

CS_VOCABULARY: set[str] = {
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "rust", "go", "ruby",
    "kotlin", "swift", "scala", "php", "r", "matlab", "sql", "html", "css", "bash",
    # Frameworks & Libraries
    "react", "angular", "vue", "nextjs", "nuxt", "svelte", "express", "fastapi",
    "django", "flask", "spring", "laravel", "rails", "graphql", "grpc",
    # DevOps & Cloud
    "docker", "kubernetes", "k8s", "jenkins", "github", "gitlab", "ci", "cd",
    "pipeline", "terraform", "ansible", "nginx", "linux", "aws", "azure", "gcp",
    "s3", "ec2", "lambda", "cloudflare", "vercel", "heroku",
    # Databases
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra",
    "dynamodb", "sqlite", "orm", "prisma", "sequelize", "hibernate",
    # CS Concepts
    "api", "rest", "http", "websocket", "microservice", "authentication",
    "authorization", "jwt", "oauth", "encryption", "hashing", "algorithm",
    "data structure", "tree", "graph", "sorting", "searching", "recursion",
    "complexity", "big o", "cache", "queue", "stack", "heap",
    # AI / ML
    "machine learning", "neural network", "deep learning", "nlp", "transformer",
    "model", "training", "inference", "dataset", "feature", "classification",
    "regression", "clustering", "xgboost", "tensorflow", "pytorch",
    # Engineering Practices
    "testing", "unit test", "integration test", "tdd", "debugging", "refactoring",
    "version control", "git", "branch", "merge", "pull request", "code review",
    "agile", "scrum", "sprint", "jira", "deployment", "monitoring", "logging",
    "documentation", "architecture", "design pattern", "solid", "dry", "mvc",
}

REFLECTION_MARKERS = [
    r"\bi (learned|discovered|realised|realized|understood|found out|noticed)\b",
    r"\bthis (taught|showed|helped|made me)\b",
    r"\bin (hindsight|retrospect|future)\b",
    r"\bgoing forward\b",
    r"\bi (would|will|should|could) (have |)(improved|changed|done|approached)\b",
    r"\bchallenge\w*\b",
    r"\bdifficult\w*\b",
    r"\bimprove\w*\b",
    r"\bsolution\b",
    r"\bproblem.solving\b",
    r"\blessons? learned\b",
]

TEMPORAL_MARKERS = [
    r"\b(monday|tuesday|wednesday|thursday|friday|week \d+)\b",
    r"\b(first|second|third|then|next|after(ward)?|finally|subsequently)\b",
    r"\b(day \d+|hour\w*)\b",
    r"\b(morning|afternoon|evening)\b",
    r"\b(began|started|completed|finished|continued|progressed)\b",
]


def clean_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)          # strip HTML
    text = re.sub(r"[^\x00-\x7F]+", " ", text)    # strip non-ASCII
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def tokenize_words(text: str) -> List[str]:
    tokens = word_tokenize(clean_text(text).lower())
    return [t for t in tokens if t not in string.punctuation]


def count_cs_keywords(text: str) -> int:
    lower = text.lower()
    count = 0
    for kw in CS_VOCABULARY:
        if kw in lower:
            count += 1
    return count


def count_pattern_matches(text: str, patterns: list[str]) -> int:
    lower = text.lower()
    return sum(1 for p in patterns if re.search(p, lower))


def word_count(text: str) -> int:
    return len(tokenize_words(text))


def sentence_count(text: str) -> int:
    return len(sent_tokenize(clean_text(text)))


def avg_sentence_length(text: str) -> float:
    sentences = sent_tokenize(clean_text(text))
    if not sentences:
        return 0.0
    return sum(len(word_tokenize(s)) for s in sentences) / len(sentences)

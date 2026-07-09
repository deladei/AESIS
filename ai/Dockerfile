FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout 600 --retries 20 -r requirements.txt

# Pre-download sentence-transformers model so runtime doesn't fetch on first request
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

# Download NLTK data
RUN python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True)"

COPY . .

# Create __init__.py files for packages
RUN touch config/__init__.py models/__init__.py services/__init__.py tasks/__init__.py routers/__init__.py utils/__init__.py

# Containers are the deployed form of this service; bare-metal local dev keeps
# the "development" default from settings.py. A real env var outranks any .env
# file under pydantic-settings, and a Render dashboard var outranks this ENV.
ENV ENVIRONMENT=production

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

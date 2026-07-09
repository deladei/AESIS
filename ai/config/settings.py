from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    AI_API_KEY: str = "dev_internal_key"

    POSTGRES_DSN: str = "postgresql://aisystem_user:aisystem1234@localhost:5432/aisystem_db"
    MONGO_URI: str = "mongodb://localhost:27017/aesis"

    # Chatbot LLM — Groq (OpenAI-compatible). Free tier: ~14.4k req/day.
    # Get a key at https://console.groq.com → leave blank to force fallback responses.
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_MODEL: str = "llama-3.1-8b-instant"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    PLAGIARISM_THRESHOLD: float = 0.35


settings = Settings()

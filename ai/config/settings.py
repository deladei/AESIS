from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    AI_API_KEY: str = "dev_internal_key"

    POSTGRES_DSN: str = "postgresql://aisystem_user:aisystem1234@localhost:5432/aisystem_db"
    MONGO_URI: str = "mongodb://localhost:27017/aesis"
    REDIS_URL: str = "redis://localhost:6379/0"

    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "mistral"

    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    PLAGIARISM_THRESHOLD: float = 0.35
    RISK_HIGH_THRESHOLD: float = 0.60
    RISK_MEDIUM_THRESHOLD: float = 0.30


settings = Settings()

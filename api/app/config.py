from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./test.db"
    SUPABASE_URL: str = "https://pqmygjztbojhltqapacw.supabase.co"
    SUPABASE_JWT_MODE: str = "jwks"  # jwks | secret
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_PROVIDER: str = "anthropic"
    LLM_ENABLED: bool = False
    LLM_MODEL_SMART: str = "claude-sonnet-5"
    LLM_MODEL_FAST: str = "claude-haiku-4-5-20251001"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    RATE_LIMIT_LLM_PER_HOUR: int = 30
    DEFAULT_TARIFF_INR_PER_KWH: float = 8.0

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def llm_enabled(self) -> bool:
        return self.LLM_ENABLED

    @property
    def anthropic_api_key(self) -> str:
        return self.ANTHROPIC_API_KEY

    @property
    def llm_model_fast(self) -> str:
        return self.LLM_MODEL_FAST

    @property
    def llm_model_smart(self) -> str:
        return self.LLM_MODEL_SMART



@lru_cache
def get_settings() -> Settings:
    return Settings()

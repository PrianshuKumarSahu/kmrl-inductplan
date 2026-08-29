from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str
    CORS_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    def get_cors_origins(self) -> List[str]:
        """Parse CORS_ORIGINS from comma-separated string or JSON list."""
        origins = self.CORS_ORIGINS.strip()
        if origins.startswith("["):
            import json
            return json.loads(origins)
        return [o.strip() for o in origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()

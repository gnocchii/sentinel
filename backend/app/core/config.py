from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# config.py lives at backend/app/core/config.py — walk up 4 levels to project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_ENV_FILE = str(_PROJECT_ROOT / ".env")


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    k2_model: str = "claude-opus-4-7"

    # K2 Think V2 (spatial reasoning)
    k2_think_api_key: str = ""
    k2_think_base_url: str = "https://api.k2think.ai/v1"
    k2_think_model: str = "MBZUAI-IFM/K2-Think-v2"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    default_scene: str = "avery_house"

    scene_latitude: float = 34.0195
    scene_longitude: float = -118.1212

    hf_token: str = ""

    class Config:
        env_file = _ENV_FILE
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()

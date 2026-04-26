from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    k2_model: str = "claude-opus-4-7"

    k2_think_api_key: str = "your-k2-think-key-here"
    k2_think_base_url: str = "https://api.k2think.ai/v1"
    k2_think_model: str = "MBZUAI-IFM/K2-Think-v2"

    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    default_scene: str = "avery_house"

    scene_latitude: float = 34.0195
    scene_longitude: float = -118.1212

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()

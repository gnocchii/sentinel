from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes import scene, cameras, k2, lighting

settings = get_settings()

app = FastAPI(title="Sentinel API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scene.router)
app.include_router(cameras.router)
app.include_router(k2.router)
app.include_router(lighting.router)


@app.get("/health")
def health():
    return {"status": "ok", "scene": settings.default_scene}

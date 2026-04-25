import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes import scene, cameras, k2, lighting, spatial
from app.api.routes.spatial import _manifest_store
from app.services.scene_to_manifest import scene_to_manifest

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-cache avery_house as a spatial manifest so /spatial/place-cameras
    # works immediately without uploading a PLY file.
    scene_path = Path(__file__).parent / "data" / "scenes" / "avery_house.json"
    if scene_path.exists():
        scene_data = json.loads(scene_path.read_text())
        manifest = scene_to_manifest(scene_data)
        _manifest_store["avery_house"] = manifest
    yield


app = FastAPI(title="Sentinel API", version="0.1.0", lifespan=lifespan)

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
app.include_router(spatial.router)


@app.get("/health")
def health():
    return {"status": "ok", "scene": settings.default_scene}

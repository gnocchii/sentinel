from fastapi import APIRouter
from app.api.routes.scene import load_scene
from app.services.lighting import simulate_lighting
from app.core.config import get_settings

router = APIRouter(prefix="/lighting", tags=["lighting"])


@router.get("/{scene_id}")
def get_lighting(scene_id: str):
    """Return full 24h lighting simulation for all cameras in a scene."""
    scene = load_scene(scene_id)
    settings = get_settings()
    return {
        "scene_id": scene_id,
        "lat": settings.scene_latitude,
        "lon": settings.scene_longitude,
        "cameras": simulate_lighting(scene, settings.scene_latitude, settings.scene_longitude),
    }


@router.get("/{scene_id}/hour/{hour}")
def get_lighting_at_hour(scene_id: str, hour: int):
    """Return lighting quality snapshot at a specific hour (0–23)."""
    if not 0 <= hour <= 23:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="hour must be 0–23")
    scene = load_scene(scene_id)
    settings = get_settings()
    all_cameras = simulate_lighting(scene, settings.scene_latitude, settings.scene_longitude)
    return {
        "hour": hour,
        "cameras": [
            {"camera_id": c["camera_id"], **c["hourly"][hour]}
            for c in all_cameras
        ],
    }

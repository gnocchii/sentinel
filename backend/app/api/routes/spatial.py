"""
Spatial analysis + K2 placement API endpoints.

POST /spatial/analyze          — upload PLY → Spatial Manifest JSON
POST /spatial/place-cameras    — Spatial Manifest → stream K2 reasoning (SSE)
POST /spatial/camera-view      — render POV image from a camera placement
GET  /spatial/manifest/{id}    — retrieve a previously computed manifest
"""

import io
import json
import base64
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from app.services.spatial_analysis import analyze_pointcloud
from app.services.k2_spatial import stream_k2_placement, parse_placements
from app.core.config import get_settings

router = APIRouter(prefix="/spatial", tags=["spatial"])

# In-memory manifest store (keyed by upload filename, good enough for demo)
_manifest_store: dict[str, dict] = {}


# ─── Analyze ────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Upload a PLY point cloud → returns the full Spatial Manifest JSON.
    Also caches it under the filename for subsequent calls.
    """
    if not file.filename.endswith(".ply"):
        raise HTTPException(status_code=400, detail="Only .ply files are accepted")

    with tempfile.NamedTemporaryFile(suffix=".ply", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        manifest = analyze_pointcloud(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    scene_id = file.filename.replace(".ply", "")
    _manifest_store[scene_id] = manifest
    manifest["_scene_id"] = scene_id
    return manifest


@router.get("/manifest/{scene_id}")
def get_manifest(scene_id: str):
    if scene_id not in _manifest_store:
        raise HTTPException(status_code=404, detail=f"No manifest for '{scene_id}'")
    return _manifest_store[scene_id]


# ─── K2 placement streaming ─────────────────────────────────────

class PlaceCamerasRequest(BaseModel):
    scene_id: str | None = None      # use cached manifest
    manifest: dict | None = None     # or provide inline
    n_cameras: int = 5


@router.post("/place-cameras")
async def place_cameras(req: PlaceCamerasRequest):
    """
    Stream K2 Think V2 camera placement reasoning as SSE.
    Provide either scene_id (from a previous /analyze call) or a manifest dict.
    """
    if req.scene_id and req.scene_id in _manifest_store:
        manifest = _manifest_store[req.scene_id]
    elif req.manifest:
        manifest = req.manifest
    else:
        raise HTTPException(status_code=400, detail="Provide scene_id or manifest")

    settings = get_settings()
    if not settings.k2_think_api_key:
        raise HTTPException(status_code=503, detail="K2_THINK_API_KEY not set in .env")

    async def event_stream():
        full = ""
        async for phase, text in stream_k2_placement(manifest, req.n_cameras):
            full += text
            if phase == "thinking":
                yield f"event: thinking\ndata: {text}\n\n"
            else:
                yield f"data: {text}\n\n"

        try:
            placements = parse_placements(full)
            yield f"event: placements\ndata: {json.dumps(placements)}\n\n"
        except ValueError:
            yield "event: error\ndata: No <placements> block found in response\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Camera view render ─────────────────────────────────────────

class CameraViewRequest(BaseModel):
    scene_id: str
    camera: dict      # { position_xyz, pan_deg, tilt_deg, fov_h_deg, fov_v_deg, id }
    width: int  = 960
    height: int = 540


@router.post("/camera-view")
async def camera_view(req: CameraViewRequest):
    """
    Render the point cloud from a camera's POV.
    Returns a base64-encoded PNG.
    Requires the PLY to have been analyzed first (uses cached manifest).
    """
    if req.scene_id not in _manifest_store:
        raise HTTPException(status_code=404, detail=f"Manifest '{req.scene_id}' not found — run /analyze first")

    # For now we need the PLY back — store path alongside manifest in production
    # Demo: use the hardcoded avery_house point cloud from the scene route
    raise HTTPException(
        status_code=501,
        detail="Camera view render requires the PLY to be re-provided. "
               "Use the CLI pipeline.py for interactive visualization."
    )

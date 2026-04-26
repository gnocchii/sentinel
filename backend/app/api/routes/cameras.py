from fastapi import APIRouter, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.api.routes.scene import load_scene
from app.services.placement import optimize_placement_for_budget
from app.services.raycast import compute_coverage, compute_per_camera_coverage
from app.services.astar import compute_threat_paths
from app.services.importance import score_importance
from app.services.importance_grid import build_importance_grid
from app.services.optimizer import optimize as importance_optimize

router = APIRouter(prefix="/cameras", tags=["cameras"])


class BudgetRequest(BaseModel):
    scene_id: str
    budget_usd: float
    locked_camera_ids: list[str] = []


class ImportanceOptimizeRequest(BaseModel):
    scene_id: str
    budget_usd: float
    max_cameras: int = 12
    refine_iters: int = 0


@router.post("/optimize")
def optimize_cameras(req: BudgetRequest):
    """
    Synchronous budget-based placement optimizer (legacy uniform-coverage path).
    Returns updated camera list + coverage metrics.
    Use POST /cameras/optimize-importance for the full K2-importance pipeline.
    """
    scene = load_scene(req.scene_id)
    result = optimize_placement_for_budget(scene, req.budget_usd, req.locked_camera_ids)
    return result


@router.post("/optimize-importance")
async def optimize_importance(req: ImportanceOptimizeRequest):
    """
    Full K2-driven pipeline: scene → K2 importance scores → rasterize → greedy placement.
    Returns cameras + per-iteration trace + final importance-weighted score.
    """
    scene = load_scene(req.scene_id)
    scores = await score_importance(scene)
    raster = build_importance_grid(scene, scores)
    result = importance_optimize(
        scene,
        raster["grid"],
        raster["bounds"],
        raster["resolution"],
        budget_usd=req.budget_usd,
        max_cameras=req.max_cameras,
        refine_iters=req.refine_iters,
    )
    return {
        "cameras": result["cameras"],
        "score": result["score"],
        "total_cost_usd": result["total_cost_usd"],
        "iterations": result["iterations"],
        "entry_points_covered": result["entry_points_covered"],
        "entry_points_total":   result["entry_points_total"],
        "blind_spots":          result["blind_spots"],
        "overlap_zones":        result["overlap_zones"],
        "scores": {
            "rooms": scores.get("rooms", {}),
            "doors": scores.get("doors", {}),
        },
    }


@router.get("/{scene_id}/coverage")
def get_coverage(scene_id: str):
    """Recompute coverage for current hardcoded camera placement."""
    scene = load_scene(scene_id)
    return compute_coverage(scene, scene["cameras"])


class CoverageRequest(BaseModel):
    scene_id: str
    cameras: list[dict]
    resolution: float = 0.25


@router.post("/coverage-3d")
def coverage_3d(req: CoverageRequest):
    """
    Per-camera visibility on a floor grid for the 3D coverage map view.
    Caller passes the current camera list (e.g. from optimizer output) so we
    don't depend on what's in the scene file.
    """
    scene = load_scene(req.scene_id)
    return compute_per_camera_coverage(scene, req.cameras, resolution=req.resolution)


@router.get("/{scene_id}/threat-paths")
def get_threat_paths(scene_id: str, target_room: str = "server_room"):
    """Compute A* threat paths from all entry points to target room."""
    scene = load_scene(scene_id)
    return compute_threat_paths(scene, scene["cameras"], target_room)


@router.post("/refine-view")
async def refine_view(
    image: UploadFile = File(...),
    camera_id: str = Form("CAM-01"),
    hour: float = Form(12.0),
    strength: float = Form(0.80),
):
    """
    Accept a PNG/JPG frame captured from the camera POV canvas,
    run it through the HF img2img refiner, return a photorealistic CCTV still.
    """
    from app.services.view_refiner import refine_camera_view_bytes
    image_bytes = await image.read()
    try:
        out_path = refine_camera_view_bytes(
            image_bytes, camera_id=camera_id, hour=hour, strength=strength
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return FileResponse(str(out_path), media_type="image/png", filename=out_path.name)

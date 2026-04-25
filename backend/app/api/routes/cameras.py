from fastapi import APIRouter
from pydantic import BaseModel
from app.api.routes.scene import load_scene
from app.services.placement import optimize_placement_for_budget
from app.services.raycast import compute_coverage
from app.services.astar import compute_threat_paths

router = APIRouter(prefix="/cameras", tags=["cameras"])


class BudgetRequest(BaseModel):
    scene_id: str
    budget_usd: float
    locked_camera_ids: list[str] = []


@router.post("/optimize")
def optimize_cameras(req: BudgetRequest):
    """
    Synchronous budget-based placement optimizer.
    Returns updated camera list + coverage metrics.
    Use POST /k2/stream-placement for the full K2-reasoned async version.
    """
    scene = load_scene(req.scene_id)
    result = optimize_placement_for_budget(scene, req.budget_usd, req.locked_camera_ids)
    return result


@router.get("/{scene_id}/coverage")
def get_coverage(scene_id: str):
    """Recompute coverage for current hardcoded camera placement."""
    scene = load_scene(scene_id)
    return compute_coverage(scene, scene["cameras"])


@router.get("/{scene_id}/threat-paths")
def get_threat_paths(scene_id: str, target_room: str = "server_room"):
    """Compute A* threat paths from all entry points to target room."""
    scene = load_scene(scene_id)
    return compute_threat_paths(scene, scene["cameras"], target_room)

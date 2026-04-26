import copy
import json
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.usda_parser import parse_usdz, write_scene

router = APIRouter(prefix="/scene", tags=["scene"])

SCENES_DIR = Path(__file__).parent.parent.parent / "data" / "scenes"


def load_scene(scene_id: str) -> dict:
    path = SCENES_DIR / f"{scene_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    return json.loads(path.read_text())


@router.post("/upload-usdz")
async def upload_usdz(file: UploadFile = File(...), scene_id: str = "polycam_scan"):
    """Upload a Polycam USDZ → parse → write scene JSON → return summary."""
    if not file.filename.lower().endswith(".usdz"):
        raise HTTPException(status_code=400, detail="expected .usdz file")

    with tempfile.NamedTemporaryFile(suffix=".usdz", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        scene = parse_usdz(tmp_path, scene_id=scene_id)
        write_scene(scene, SCENES_DIR)
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    return {
        "scene_id": scene_id,
        "rooms": len(scene["rooms"]),
        "walls": len(scene["walls"]),
        "doors": len(scene["entry_points"]),
        "obstructions": len(scene["obstructions"]),
        "bounds": scene["bounds"],
    }


@router.get("/{scene_id}")
def get_scene(scene_id: str):
    """Return full scene data including hardcoded cameras and analysis."""
    return load_scene(scene_id)


@router.get("/{scene_id}/pointcloud")
def get_pointcloud(scene_id: str):
    """
    Return a sampled point cloud for the scene.
    Generates points from room geometry (walls, floor, ceiling).
    Format: { points: [[x, y, z, r, g, b], ...] }
    """
    scene = load_scene(scene_id)
    points = _generate_pointcloud(scene)
    return {"scene_id": scene_id, "count": len(points), "points": points}


@router.get("/{scene_id}/analysis")
def get_analysis(scene_id: str):
    scene = load_scene(scene_id)
    return scene.get("analysis", {})


class WhatIfRequest(BaseModel):
    scene_id: str
    removed_entry_ids: list[str] = []
    budget_usd: float = 2500.0


@router.post("/what-if")
async def what_if_analysis(req: WhatIfRequest):
    """
    Re-run camera placement on a modified scene (entry points blocked/removed).
    Returns new camera list + coverage delta vs the original scene — no persistence.
    """
    from app.services.importance_grid import build_importance_grid
    from app.services.optimizer import optimize

    scene = load_scene(req.scene_id)
    modified = copy.deepcopy(scene)
    modified["entry_points"] = [
        ep for ep in modified["entry_points"]
        if ep["id"] not in req.removed_entry_ids
    ]

    # Use empty K2 scores so the grid is geometry-based (fast, no API call)
    raster = build_importance_grid(modified, scores={})
    result = optimize(
        modified,
        raster["grid"],
        raster["bounds"],
        raster["resolution"],
        budget_usd=req.budget_usd,
        max_cameras=12,
    )

    orig_coverage = scene.get("analysis", {}).get("coverage_pct", 0.0)
    orig_count = len(scene.get("cameras", []))
    new_coverage = round(result["score"] * 100, 2)

    return {
        "cameras": result["cameras"],
        "coverage_pct": new_coverage,
        "total_cost_usd": result["total_cost_usd"],
        "entry_points_covered": result["entry_points_covered"],
        "entry_points_total": result["entry_points_total"],
        "blind_spots": result["blind_spots"],
        "removed_entry_ids": req.removed_entry_ids,
        "orig_coverage_pct": orig_coverage,
        "delta_coverage_pct": round(new_coverage - orig_coverage, 2),
        "delta_camera_count": len(result["cameras"]) - orig_count,
    }


def _generate_pointcloud(scene: dict) -> list[list[float]]:
    """Generate ~8k points from room geometry for the point cloud view."""
    import random
    import math
    rng = random.Random(42)
    points = []
    bounds = scene["bounds"]

    def rand_in(lo, hi):
        return rng.uniform(lo, hi)

    # Floor — cool gray
    for _ in range(2000):
        x = rand_in(bounds["min"][0], bounds["max"][0])
        y = rand_in(bounds["min"][1], bounds["max"][1])
        v = rng.uniform(0.3, 0.5)
        points.append([x, y, 0, v, v, v + 0.05])

    # Ceiling — slightly lighter
    for _ in range(1000):
        x = rand_in(bounds["min"][0], bounds["max"][0])
        y = rand_in(bounds["min"][1], bounds["max"][1])
        v = rng.uniform(0.4, 0.6)
        points.append([x, y, bounds["max"][2], v, v, v])

    # Walls
    for wall in scene.get("walls", []):
        p0 = wall["from"]
        p1 = wall["to"]
        length = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        n_pts = max(50, int(length / 0.15))
        h = wall["height"]
        for _ in range(n_pts):
            t = rng.random()
            z = rand_in(0, h)
            x = p0[0] + t * (p1[0] - p0[0]) + rng.gauss(0, 0.02)
            y = p0[1] + t * (p1[1] - p0[1]) + rng.gauss(0, 0.02)
            v = rng.uniform(0.35, 0.55)
            points.append([x, y, z, v, v + 0.02, v + 0.05])

    # Obstructions — slightly warmer
    for obs in scene.get("obstructions", []):
        ob = obs["bounds"]
        for _ in range(100):
            x = rand_in(ob["min"][0], ob["max"][0])
            y = rand_in(ob["min"][1], ob["max"][1])
            z = rand_in(ob["min"][2], ob["max"][2])
            points.append([x, y, z, 0.45, 0.4, 0.35])

    return [[round(v, 3) for v in p] for p in points]

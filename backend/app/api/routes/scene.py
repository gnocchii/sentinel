import json
import tempfile
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile

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
